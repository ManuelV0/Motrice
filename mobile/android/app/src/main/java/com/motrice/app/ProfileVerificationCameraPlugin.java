package com.motrice.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.exifinterface.media.ExifInterface;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Camera path dedicated to profile verification.
 *
 * The system camera writes the original photo directly to a temporary file.
 * Motrice then decodes a sampled bitmap and never loads the full high-resolution
 * image in the WebView. This prevents memory pressure on high-megapixel cameras
 * and older Android phones while keeping enough detail for human verification.
 */
@CapacitorPlugin(
        name = "ProfileVerificationCamera",
        permissions = {
                @Permission(
                        alias = ProfileVerificationCameraPlugin.CAMERA_ALIAS,
                        strings = {Manifest.permission.CAMERA}
                )
        }
)
public class ProfileVerificationCameraPlugin extends Plugin {

    static final String CAMERA_ALIAS = "camera";
    private static final String PREFS_NAME = "motrice_profile_verification_camera";
    private static final String PENDING_PATH_KEY = "pending_capture_path";
    private static final String PHOTO_DIRECTORY = "profile-verification";
    private static final int DEFAULT_MAX_DIMENSION = 1080;
    private static final int MIN_MAX_DIMENSION = 720;
    private static final int MAX_MAX_DIMENSION = 1600;
    private static final int DEFAULT_JPEG_QUALITY = 76;
    private static final int MIN_JPEG_QUALITY = 65;
    private static final int MAX_JPEG_QUALITY = 85;
    private static final long STALE_FILE_AGE_MS = 24L * 60L * 60L * 1000L;

    private final ExecutorService imageExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void checkCameraPermission(PluginCall call) {
        call.resolve(cameraPermissionResult());
    }

    @PluginMethod
    public void requestCameraPermission(PluginCall call) {
        if (getPermissionState(CAMERA_ALIAS) == PermissionState.GRANTED) {
            call.resolve(cameraPermissionResult());
            return;
        }
        requestPermissionForAlias(CAMERA_ALIAS, call, "cameraPermissionCallback");
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        call.resolve(cameraPermissionResult());
    }

    @PluginMethod
    public void takeVerificationPhoto(PluginCall call) {
        if (getPermissionState(CAMERA_ALIAS) != PermissionState.GRANTED) {
            requestPermissionForAlias(CAMERA_ALIAS, call, "capturePermissionCallback");
            return;
        }
        openSystemCamera(call);
    }

    @PermissionCallback
    private void capturePermissionCallback(PluginCall call) {
        if (getPermissionState(CAMERA_ALIAS) != PermissionState.GRANTED) {
            call.reject(
                    "Permesso fotocamera non concesso",
                    "MOTRICE_CAMERA_PERMISSION_REQUIRED"
            );
            return;
        }
        openSystemCamera(call);
    }

    private JSObject cameraPermissionResult() {
        PermissionState state = getPermissionState(CAMERA_ALIAS);
        JSObject result = new JSObject();
        result.put("camera", state == null ? "denied" : state.toString());
        return result;
    }

    private void openSystemCamera(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.reject("Fotocamera non disponibile", "MOTRICE_CAMERA_UNAVAILABLE");
            return;
        }

        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (intent.resolveActivity(activity.getPackageManager()) == null) {
            call.reject("Nessuna fotocamera disponibile sul telefono", "MOTRICE_CAMERA_UNAVAILABLE");
            return;
        }

        try {
            File directory = photoDirectory();
            cleanupStaleFiles(directory);
            File rawPhoto = new File(directory, "capture-" + UUID.randomUUID() + ".jpg");
            if (!rawPhoto.createNewFile()) {
                throw new IOException("Impossibile creare il file temporaneo");
            }

            Uri outputUri = FileProvider.getUriForFile(
                    activity,
                    getContext().getPackageName() + ".fileprovider",
                    rawPhoto
            );
            savePendingPath(rawPhoto.getAbsolutePath());

            intent.putExtra(MediaStore.EXTRA_OUTPUT, outputUri);
            intent.setClipData(ClipData.newRawUri("Motrice profile verification", outputUri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);

            if (Boolean.TRUE.equals(call.getBoolean("preferFrontCamera", true))) {
                // These are hints because camera apps from different vendors use
                // different extras. Unsupported hints are safely ignored.
                intent.putExtra("android.intent.extras.CAMERA_FACING", 1);
                intent.putExtra("android.intent.extra.USE_FRONT_CAMERA", true);
                intent.putExtra("android.intent.extras.LENS_FACING_FRONT", 1);
            }

            List<ResolveInfo> handlers = activity.getPackageManager().queryIntentActivities(
                    intent,
                    PackageManager.MATCH_DEFAULT_ONLY
            );
            for (ResolveInfo handler : handlers) {
                activity.grantUriPermission(
                        handler.activityInfo.packageName,
                        outputUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
            }

            startActivityForResult(call, intent, "cameraResult");
        } catch (Exception error) {
            clearPendingPath();
            call.reject("Non riesco ad aprire la fotocamera", "MOTRICE_CAMERA_UNAVAILABLE", error);
        }
    }

    @ActivityCallback
    private void cameraResult(PluginCall call, ActivityResult activityResult) {
        String rawPath = getPendingPath();
        clearPendingPath();

        if (rawPath == null || rawPath.isBlank()) {
            call.reject("La foto non è stata salvata", "MOTRICE_CAMERA_FILE_MISSING");
            return;
        }

        File rawPhoto = new File(rawPath);
        revokeCameraUri(rawPhoto);
        if (activityResult.getResultCode() != Activity.RESULT_OK) {
            deleteQuietly(rawPhoto);
            call.reject("Scatto annullato", "MOTRICE_CAMERA_CANCELLED");
            return;
        }

        int maxDimension = clamp(
                call.getInt("maxDimension", DEFAULT_MAX_DIMENSION),
                MIN_MAX_DIMENSION,
                MAX_MAX_DIMENSION
        );
        int quality = clamp(
                call.getInt("quality", DEFAULT_JPEG_QUALITY),
                MIN_JPEG_QUALITY,
                MAX_JPEG_QUALITY
        );
        String kind = "challenge".equals(call.getString("kind")) ? "challenge" : "profile";

        imageExecutor.execute(() -> {
            File processedPhoto = null;
            try {
                ProcessedImage processed = processPhoto(rawPhoto, maxDimension, quality, kind);
                processedPhoto = processed.file;

                JSObject result = new JSObject();
                result.put("uri", Uri.fromFile(processed.file).toString());
                result.put("format", "jpeg");
                result.put("mimeType", "image/jpeg");
                result.put("width", processed.width);
                result.put("height", processed.height);
                result.put("size", processed.file.length());
                result.put("temporary", true);
                result.put("provider", "motrice-native-safe-camera");
                result.put("kind", kind);
                resolveOnMainThread(call, result);
            } catch (Throwable error) {
                deleteQuietly(processedPhoto);
                rejectOnMainThread(
                        call,
                        "Non riesco a preparare la foto. Riprova oppure usa la galleria.",
                        "MOTRICE_CAMERA_PROCESSING_FAILED",
                        error
                );
            } finally {
                deleteQuietly(rawPhoto);
            }
        });
    }

    @PluginMethod
    public void deleteTemporaryPhoto(PluginCall call) {
        String value = call.getString("uri", "");
        if (value.isBlank()) {
            call.resolve();
            return;
        }

        try {
            Uri uri = Uri.parse(value);
            File requested = new File(uri.getPath() == null ? "" : uri.getPath()).getCanonicalFile();
            File allowedDirectory = photoDirectory().getCanonicalFile();
            String allowedPrefix = allowedDirectory.getPath() + File.separator;
            if (!requested.getPath().startsWith(allowedPrefix)) {
                call.reject("File temporaneo non valido", "MOTRICE_CAMERA_INVALID_FILE");
                return;
            }
            deleteQuietly(requested);
            call.resolve();
        } catch (Exception error) {
            call.reject("Impossibile eliminare la foto temporanea", error);
        }
    }

    private ProcessedImage processPhoto(File source, int maxDimension, int quality, String kind) throws IOException {
        if (!source.isFile() || source.length() == 0L) {
            throw new IOException("File fotografico vuoto");
        }

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(source.getAbsolutePath(), bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            throw new IOException("Formato fotografico non leggibile");
        }

        BitmapFactory.Options decodeOptions = new BitmapFactory.Options();
        decodeOptions.inSampleSize = calculateSampleSize(bounds.outWidth, bounds.outHeight, maxDimension);
        decodeOptions.inPreferredConfig = Bitmap.Config.RGB_565;
        decodeOptions.inDither = true;
        Bitmap decoded = BitmapFactory.decodeFile(source.getAbsolutePath(), decodeOptions);
        if (decoded == null) throw new IOException("Impossibile decodificare la foto");

        Bitmap oriented = null;
        Bitmap scaled = null;
        try {
            oriented = rotateForExif(decoded, readExifRotation(source));
            int currentWidth = oriented.getWidth();
            int currentHeight = oriented.getHeight();
            float scale = Math.min(1f, (float) maxDimension / Math.max(currentWidth, currentHeight));
            int targetWidth = Math.max(1, Math.round(currentWidth * scale));
            int targetHeight = Math.max(1, Math.round(currentHeight * scale));
            scaled = scale < 1f
                    ? Bitmap.createScaledBitmap(oriented, targetWidth, targetHeight, true)
                    : oriented;

            File output = new File(
                    photoDirectory(),
                    "motrice-" + kind + "-" + UUID.randomUUID() + ".jpg"
            );
            try (FileOutputStream stream = new FileOutputStream(output)) {
                if (!scaled.compress(Bitmap.CompressFormat.JPEG, quality, stream)) {
                    throw new IOException("Compressione della foto non riuscita");
                }
                stream.flush();
            }
            return new ProcessedImage(output, scaled.getWidth(), scaled.getHeight());
        } finally {
            if (scaled != null && scaled != oriented && !scaled.isRecycled()) scaled.recycle();
            if (oriented != null && oriented != decoded && !oriented.isRecycled()) oriented.recycle();
            if (!decoded.isRecycled()) decoded.recycle();
        }
    }

    private static int calculateSampleSize(int width, int height, int target) {
        int sampleSize = 1;
        int longestSide = Math.max(width, height);
        // Keep the decoded bitmap below twice the target dimension. This caps
        // memory without reducing a normal phone selfie more than necessary.
        while (longestSide / (sampleSize * 2) >= target) sampleSize *= 2;
        return sampleSize;
    }

    private static int readExifRotation(File source) {
        try {
            ExifInterface exif = new ExifInterface(source);
            int orientation = exif.getAttributeInt(
                    ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL
            );
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90) return 90;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_180) return 180;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_270) return 270;
        } catch (IOException ignored) {
            // A missing EXIF block is valid; keep the original orientation.
        }
        return 0;
    }

    private static Bitmap rotateForExif(Bitmap source, int degrees) {
        if (degrees == 0) return source;
        Matrix matrix = new Matrix();
        matrix.postRotate(degrees);
        return Bitmap.createBitmap(source, 0, 0, source.getWidth(), source.getHeight(), matrix, true);
    }

    private File photoDirectory() throws IOException {
        File directory = new File(getContext().getCacheDir(), PHOTO_DIRECTORY);
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new IOException("Impossibile creare la cartella fotografica temporanea");
        }
        return directory;
    }

    private void cleanupStaleFiles(File directory) {
        File[] files = directory.listFiles();
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - STALE_FILE_AGE_MS;
        for (File file : files) {
            if (file.isFile() && file.lastModified() < cutoff) deleteQuietly(file);
        }
    }

    private SharedPreferences cameraPreferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private void savePendingPath(String path) {
        cameraPreferences().edit().putString(PENDING_PATH_KEY, path).apply();
    }

    private String getPendingPath() {
        return cameraPreferences().getString(PENDING_PATH_KEY, null);
    }

    private void clearPendingPath() {
        cameraPreferences().edit().remove(PENDING_PATH_KEY).apply();
    }

    private void revokeCameraUri(File file) {
        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file
            );
            getContext().revokeUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
        } catch (RuntimeException ignored) {
            // The camera app may already have released the temporary grant.
        }
    }

    private void resolveOnMainThread(PluginCall call, JSObject result) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve(result);
            return;
        }
        activity.runOnUiThread(() -> call.resolve(result));
    }

    private void rejectOnMainThread(PluginCall call, String message, String code, Throwable error) {
        Activity activity = getActivity();
        Exception exception = error instanceof Exception
                ? (Exception) error
                : new Exception(error);
        Runnable reject = () -> call.reject(message, code, exception);
        if (activity == null) reject.run();
        else activity.runOnUiThread(reject);
    }

    private static int clamp(Integer value, int minimum, int maximum) {
        int safe = value == null ? minimum : value;
        return Math.max(minimum, Math.min(maximum, safe));
    }

    private static void deleteQuietly(File file) {
        if (file != null && file.isFile()) {
            try {
                file.delete();
            } catch (SecurityException ignored) {
                // Cache cleanup is best-effort.
            }
        }
    }

    private static final class ProcessedImage {
        final File file;
        final int width;
        final int height;

        ProcessedImage(File file, int width, int height) {
            this.file = file;
            this.width = width;
            this.height = height;
        }
    }
}
