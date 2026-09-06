package com.motrice.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class EventLocationService extends Service implements LocationListener {
    public static final String ACTION_START = "com.motrice.app.START_EVENT_LOCATION";
    public static final String ACTION_STOP = "com.motrice.app.STOP_EVENT_LOCATION";

    private static final String PREFS = "motrice_event_location_tracking";
    private static final String CHANNEL_ID = "motrice_event_presence";
    private static final int NOTIFICATION_ID = 6210;
    private static final int MAX_PENDING = 720;
    private static final Object QUEUE_LOCK = new Object();

    private final ExecutorService uploadExecutor = Executors.newSingleThreadExecutor();
    private LocationManager locationManager;
    private volatile boolean finishing = false;

    public static void saveConfiguration(
            Context context,
            String eventId,
            String eventTitle,
            double latitude,
            double longitude,
            double radiusM,
            long expectedEndAtMs,
            String serverUrl,
            String anonKey,
            String accessToken,
            String refreshToken,
            long intervalMs
    ) {
        prefs(context).edit()
                .putBoolean("active", true)
                .putString("eventId", eventId)
                .putString("eventTitle", eventTitle)
                .putLong("latitudeBits", Double.doubleToRawLongBits(latitude))
                .putLong("longitudeBits", Double.doubleToRawLongBits(longitude))
                .putLong("radiusBits", Double.doubleToRawLongBits(radiusM))
                .putLong("expectedEndAtMs", expectedEndAtMs)
                .putString("serverUrl", trimTrailingSlash(serverUrl))
                .putString("anonKey", anonKey)
                .putString("accessToken", accessToken)
                .putString("refreshToken", refreshToken)
                .putLong("intervalMs", intervalMs)
                .putString("lastError", "")
                .apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String trimTrailingSlash(String value) {
        return value == null ? "" : value.replaceAll("/+$", "");
    }

    public static JSObject readStatus(Context context) {
        SharedPreferences values = prefs(context);
        JSObject result = new JSObject();
        result.put("active", values.getBoolean("active", false));
        result.put("eventId", values.getString("eventId", ""));
        result.put("lastPingAt", values.getString("lastPingAt", null));
        result.put("lastError", values.getString("lastError", ""));
        result.put("pendingPingCount", readQueue(context).length());
        result.put("expectedEndAtMs", values.getLong("expectedEndAtMs", 0L));
        result.put("accessToken", values.getString("accessToken", ""));
        result.put("refreshToken", values.getString("refreshToken", ""));
        return result;
    }

    public static void markStopped(Context context, boolean clearCredentials) {
        SharedPreferences.Editor editor = prefs(context).edit().putBoolean("active", false);
        if (clearCredentials) editor.remove("accessToken").remove("refreshToken");
        editor.apply();
    }

    public static JSArray readPendingPings(Context context) {
        JSArray result = new JSArray();
        JSONArray queue = readQueue(context);
        for (int index = 0; index < queue.length(); index += 1) {
            JSONObject item = queue.optJSONObject(index);
            if (item != null) result.put(item);
        }
        return result;
    }

    public static void ackPendingPings(Context context, Set<String> ids) {
        if (ids == null || ids.isEmpty()) return;
        synchronized (QUEUE_LOCK) {
            JSONArray source = readQueue(context);
            JSONArray remaining = new JSONArray();
            for (int index = 0; index < source.length(); index += 1) {
                JSONObject item = source.optJSONObject(index);
                if (item != null && !ids.contains(item.optString("id"))) remaining.put(item);
            }
            prefs(context).edit().putString("pendingPings", remaining.toString()).apply();
        }
    }

    private static JSONArray readQueue(Context context) {
        synchronized (QUEUE_LOCK) {
            try {
                return new JSONArray(prefs(context).getString("pendingPings", "[]"));
            } catch (JSONException ignored) {
                return new JSONArray();
            }
        }
    }

    private static void appendPing(Context context, JSONObject ping) {
        synchronized (QUEUE_LOCK) {
            JSONArray source = readQueue(context);
            JSONArray next = new JSONArray();
            int first = Math.max(0, source.length() - MAX_PENDING + 1);
            for (int index = first; index < source.length(); index += 1) {
                JSONObject item = source.optJSONObject(index);
                if (item != null) next.put(item);
            }
            next.put(ping);
            prefs(context).edit().putString("pendingPings", next.toString()).apply();
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            markStopped(this, false);
            stopLocationUpdates();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        SharedPreferences values = prefs(this);
        long expectedEndAt = values.getLong("expectedEndAtMs", 0L);
        if (!values.getBoolean("active", false)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildNotification(values.getString("eventTitle", "Evento Motrice")));
        if (expectedEndAt <= System.currentTimeMillis()) {
            finishExpiredTracking();
            return START_NOT_STICKY;
        }
        startLocationUpdates();
        uploadExecutor.execute(this::uploadPendingPings);
        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Presenza evento",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Monitoraggio posizione durante un evento Motrice attivo");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setLightColor(Color.parseColor("#C6FF00"));
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String eventTitle) {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_monochrome)
                .setContentTitle("Presenza Motrice attiva")
                .setContentText(eventTitle + " · posizione verificata in background")
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void startLocationUpdates() {
        boolean hasFine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean hasCoarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        if (!hasFine && !hasCoarse) {
            setError("Permesso posizione revocato");
            return;
        }

        stopLocationUpdates();
        long interval = Math.max(30000L, prefs(this).getLong("intervalMs", 60000L));
        try {
            if (hasFine && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, interval, 0f, this, Looper.getMainLooper());
                Location last = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                if (last != null && System.currentTimeMillis() - last.getTime() < 30000L) onLocationChanged(last);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, interval, 0f, this, Looper.getMainLooper());
            }
        } catch (SecurityException error) {
            setError("Permesso posizione non disponibile");
        } catch (RuntimeException error) {
            setError(error.getMessage() == null ? "Servizio posizione non disponibile" : error.getMessage());
        }
    }

    private void stopLocationUpdates() {
        if (locationManager == null) return;
        try {
            locationManager.removeUpdates(this);
        } catch (SecurityException ignored) {
            // No-op: il permesso potrebbe essere stato revocato durante il servizio.
        }
    }

    @Override
    public void onLocationChanged(@NonNull Location location) {
        SharedPreferences values = prefs(this);
        if (!values.getBoolean("active", false)) return;
        if (values.getLong("expectedEndAtMs", 0L) <= System.currentTimeMillis()) {
            finishExpiredTracking();
            return;
        }

        JSONObject ping = new JSONObject();
        try {
            long recordedAt = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
            ping.put("id", recordedAt + "-android-" + UUID.randomUUID());
            ping.put("lat", location.getLatitude());
            ping.put("lng", location.getLongitude());
            ping.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
            ping.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
            ping.put("recordedAt", isoTimestamp(recordedAt));
            ping.put("source", "background");
            appendPing(this, ping);
            values.edit().putString("lastPingAt", ping.getString("recordedAt")).putString("lastError", "").apply();
            uploadExecutor.execute(this::uploadPendingPings);
        } catch (JSONException error) {
            setError("Campione posizione non valido");
        }
    }

    @Override
    public void onProviderDisabled(@NonNull String provider) {
        setError("Posizione del telefono disattivata");
    }

    @Override public void onProviderEnabled(@NonNull String provider) {
        prefs(this).edit().putString("lastError", "").apply();
        startLocationUpdates();
    }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }

    private void uploadPendingPings() {
        SharedPreferences values = prefs(this);
        if (!values.getBoolean("active", false)) return;
        JSONArray queue = readQueue(this);
        Set<String> acknowledged = new HashSet<>();
        for (int index = 0; index < queue.length(); index += 1) {
            JSONObject ping = queue.optJSONObject(index);
            if (ping == null) continue;
            try {
                uploadPing(ping, false);
                acknowledged.add(ping.optString("id"));
            } catch (UnauthorizedException unauthorized) {
                if (!refreshSession()) {
                    setError("Sessione scaduta: riapri Motrice");
                    break;
                }
                try {
                    uploadPing(ping, true);
                    acknowledged.add(ping.optString("id"));
                } catch (Exception retryError) {
                    setError("Sincronizzazione in attesa");
                    break;
                }
            } catch (Exception error) {
                setError("Sincronizzazione in attesa");
                break;
            }
        }
        ackPendingPings(this, acknowledged);
    }

    private void uploadPing(JSONObject ping, boolean afterRefresh) throws Exception {
        SharedPreferences values = prefs(this);
        String serverUrl = values.getString("serverUrl", "");
        String anonKey = values.getString("anonKey", "");
        String accessToken = values.getString("accessToken", "");
        String eventId = values.getString("eventId", "");
        if (serverUrl.isEmpty() || anonKey.isEmpty() || accessToken.isEmpty() || eventId.isEmpty()) {
            throw new IllegalStateException("Configurazione server assente");
        }

        JSONObject body = new JSONObject();
        body.put("target_event_id", eventId);
        body.put("client_ping_id_value", ping.getString("id"));
        body.put("sample_lat", ping.getDouble("lat"));
        body.put("sample_lng", ping.getDouble("lng"));
        body.put("sample_accuracy_m", ping.isNull("accuracy") ? JSONObject.NULL : ping.getDouble("accuracy"));
        body.put("sample_speed_mps", ping.isNull("speed") ? JSONObject.NULL : ping.getDouble("speed"));
        body.put("client_recorded_at_value", ping.getString("recordedAt"));
        body.put("sample_source_value", ping.optString("source", "background"));

        HttpURLConnection connection = openJsonConnection(
                serverUrl + "/rest/v1/rpc/record_event_tracking_ping",
                anonKey,
                accessToken
        );
        writeBody(connection, body.toString());
        int code = connection.getResponseCode();
        closeResponse(connection, code);
        if (code == 401 || code == 403) throw new UnauthorizedException();
        if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code);
        prefs(this).edit().putString("lastError", "").apply();
    }

    private boolean refreshSession() {
        SharedPreferences values = prefs(this);
        String serverUrl = values.getString("serverUrl", "");
        String anonKey = values.getString("anonKey", "");
        String refreshToken = values.getString("refreshToken", "");
        if (serverUrl.isEmpty() || anonKey.isEmpty() || refreshToken.isEmpty()) return false;
        try {
            HttpURLConnection connection = openJsonConnection(
                    serverUrl + "/auth/v1/token?grant_type=refresh_token",
                    anonKey,
                    null
            );
            JSONObject body = new JSONObject();
            body.put("refresh_token", refreshToken);
            writeBody(connection, body.toString());
            int code = connection.getResponseCode();
            String response = readResponse(connection, code);
            if (code < 200 || code >= 300) return false;
            JSONObject payload = new JSONObject(response);
            String nextAccess = payload.optString("access_token", "");
            String nextRefresh = payload.optString("refresh_token", refreshToken);
            if (nextAccess.isEmpty()) return false;
            values.edit().putString("accessToken", nextAccess).putString("refreshToken", nextRefresh).apply();
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private static HttpURLConnection openJsonConnection(String url, String anonKey, @Nullable String accessToken) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(15000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("apikey", anonKey);
        if (accessToken != null && !accessToken.isEmpty()) {
            connection.setRequestProperty("Authorization", "Bearer " + accessToken);
        }
        return connection;
    }

    private static void writeBody(HttpURLConnection connection, String body) throws Exception {
        try (OutputStream output = connection.getOutputStream()) {
            output.write(body.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static String readResponse(HttpURLConnection connection, int code) throws Exception {
        InputStream stream = code >= 200 && code < 400 ? connection.getInputStream() : connection.getErrorStream();
        if (stream == null) return "";
        StringBuilder value = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) value.append(line);
        }
        connection.disconnect();
        return value.toString();
    }

    private static void closeResponse(HttpURLConnection connection, int code) throws Exception {
        readResponse(connection, code);
    }

    private void setError(String message) {
        prefs(this).edit().putString("lastError", message == null ? "" : message).apply();
    }

    private void finishExpiredTracking() {
        if (finishing) return;
        finishing = true;
        stopLocationUpdates();
        uploadExecutor.execute(() -> {
            uploadPendingPings();
            try {
                stopRemoteTracking();
            } catch (UnauthorizedException unauthorized) {
                if (refreshSession()) {
                    try {
                        stopRemoteTracking();
                    } catch (Exception ignored) {
                        // Il client completera la sincronizzazione alla prossima apertura.
                    }
                }
            } catch (Exception ignored) {
                // Il client completera la sincronizzazione alla prossima apertura.
            }
            markStopped(this, false);
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
        });
    }

    private void stopRemoteTracking() throws Exception {
        SharedPreferences values = prefs(this);
        String serverUrl = values.getString("serverUrl", "");
        String anonKey = values.getString("anonKey", "");
        String accessToken = values.getString("accessToken", "");
        String eventId = values.getString("eventId", "");
        if (serverUrl.isEmpty() || anonKey.isEmpty() || accessToken.isEmpty() || eventId.isEmpty()) return;

        JSONObject body = new JSONObject();
        body.put("target_event_id", eventId);
        body.put("final_status_value", "completed");
        body.put("reason_value", "fine_evento");
        HttpURLConnection connection = openJsonConnection(
                serverUrl + "/rest/v1/rpc/stop_event_location_tracking",
                anonKey,
                accessToken
        );
        writeBody(connection, body.toString());
        int code = connection.getResponseCode();
        closeResponse(connection, code);
        if (code == 401 || code == 403) throw new UnauthorizedException();
        if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code);
    }

    private static String isoTimestamp(long timestampMs) {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(new Date(timestampMs));
    }

    @Override
    public void onDestroy() {
        stopLocationUpdates();
        uploadExecutor.shutdown();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static class UnauthorizedException extends Exception { }
}
