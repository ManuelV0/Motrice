package com.motrice.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "EventLocationTracking")
public class EventLocationTrackingPlugin extends Plugin {

    private static final long MIN_POSITION_TIMEOUT_MS = 1000L;
    private static final long MAX_POSITION_TIMEOUT_MS = 60000L;
    private final Set<SingleLocationRequest> activeLocationRequests =
            Collections.synchronizedSet(new HashSet<>());

    /**
     * Safe foreground location acquisition for Android.
     *
     * This deliberately uses Android's LocationManager instead of the Google
     * Play Services settings-resolution flow. The latter can dispatch an
     * ActivityResult before the Capacitor geolocation plugin has initialized
     * its resolver and force-close the app on some devices.
     */
    @PluginMethod
    public void getCurrentPosition(PluginCall call) {
        boolean hasFine = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean hasCoarse = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        if (!hasFine && !hasCoarse) {
            call.reject(
                    "Permesso posizione non concesso",
                    "MOTRICE_LOCATION_PERMISSION_REQUIRED"
            );
            return;
        }

        LocationManager manager = (LocationManager) getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
        if (manager == null) {
            call.reject("Servizio posizione non disponibile", "MOTRICE_POSITION_UNAVAILABLE");
            return;
        }

        boolean highAccuracy = Boolean.TRUE.equals(call.getBoolean("enableHighAccuracy", false));
        long timeoutMs = clampLong(
                call.getDouble("timeout", 15000.0).longValue(),
                MIN_POSITION_TIMEOUT_MS,
                MAX_POSITION_TIMEOUT_MS
        );
        long maximumAgeMs = Math.max(0L, call.getDouble("maximumAge", 0.0).longValue());
        List<String> enabledProviders = new ArrayList<>();

        try {
            if (highAccuracy && hasFine && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                enabledProviders.add(LocationManager.GPS_PROVIDER);
            }
            if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                enabledProviders.add(LocationManager.NETWORK_PROVIDER);
            }
            if (hasFine
                    && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                    && !enabledProviders.contains(LocationManager.GPS_PROVIDER)) {
                enabledProviders.add(LocationManager.GPS_PROVIDER);
            }
        } catch (RuntimeException error) {
            call.reject("Impossibile leggere lo stato della posizione", "MOTRICE_POSITION_UNAVAILABLE");
            return;
        }

        if (enabledProviders.isEmpty()) {
            call.reject("Posizione del telefono disattivata", "MOTRICE_LOCATION_DISABLED");
            return;
        }

        SingleLocationRequest request = new SingleLocationRequest(
                call,
                manager,
                enabledProviders,
                maximumAgeMs,
                timeoutMs
        );
        activeLocationRequests.add(request);
        request.start();
    }

    private static long clampLong(long value, long minimum, long maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    private static boolean isBetterLocation(Location candidate, Location current) {
        if (candidate == null) return false;
        if (current == null) return true;

        long ageDelta = candidate.getTime() - current.getTime();
        boolean significantlyNewer = ageDelta > 120000L;
        boolean significantlyOlder = ageDelta < -120000L;
        if (significantlyNewer) return true;
        if (significantlyOlder) return false;

        float accuracyDelta = candidate.getAccuracy() - current.getAccuracy();
        boolean moreAccurate = accuracyDelta < 0;
        boolean newer = ageDelta > 0;
        return moreAccurate || (newer && accuracyDelta <= 50f);
    }

    private static JSObject positionResult(Location location) {
        JSObject coords = new JSObject();
        coords.put("latitude", location.getLatitude());
        coords.put("longitude", location.getLongitude());
        coords.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
        coords.put("altitude", location.hasAltitude() ? location.getAltitude() : JSONObject.NULL);
        coords.put("altitudeAccuracy", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasVerticalAccuracy()
                ? location.getVerticalAccuracyMeters()
                : JSONObject.NULL);
        coords.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
        coords.put("heading", location.hasBearing() ? location.getBearing() : JSONObject.NULL);

        JSObject result = new JSObject();
        result.put("coords", coords);
        result.put("timestamp", location.getTime() > 0 ? location.getTime() : System.currentTimeMillis());
        return result;
    }

    @Override
    protected void handleOnDestroy() {
        List<SingleLocationRequest> requests;
        synchronized (activeLocationRequests) {
            requests = new ArrayList<>(activeLocationRequests);
        }
        for (SingleLocationRequest request : requests) {
            request.cancel();
        }
        super.handleOnDestroy();
    }

    private final class SingleLocationRequest implements LocationListener {
        private final PluginCall call;
        private final LocationManager manager;
        private final List<String> providers;
        private final long maximumAgeMs;
        private final long timeoutMs;
        private final Handler mainHandler = new Handler(Looper.getMainLooper());
        private final AtomicBoolean finished = new AtomicBoolean(false);
        private Location bestLocation;
        private final Runnable timeoutAction = () -> {
            if (bestLocation != null) {
                resolve(bestLocation);
            } else {
                reject("Tempo scaduto durante il recupero della posizione", "MOTRICE_LOCATION_TIMEOUT");
            }
        };

        SingleLocationRequest(
                PluginCall call,
                LocationManager manager,
                List<String> providers,
                long maximumAgeMs,
                long timeoutMs
        ) {
            this.call = call;
            this.manager = manager;
            this.providers = providers;
            this.maximumAgeMs = maximumAgeMs;
            this.timeoutMs = timeoutMs;
        }

        void start() {
            mainHandler.post(() -> {
                if (finished.get()) return;

                long now = System.currentTimeMillis();
                if (maximumAgeMs > 0L) {
                    for (String provider : providers) {
                        try {
                            Location cached = manager.getLastKnownLocation(provider);
                            if (cached != null
                                    && now - cached.getTime() <= maximumAgeMs
                                    && isBetterLocation(cached, bestLocation)) {
                                bestLocation = cached;
                            }
                        } catch (SecurityException ignored) {
                            reject("Permesso posizione non concesso", "MOTRICE_LOCATION_PERMISSION_REQUIRED");
                            return;
                        } catch (RuntimeException ignored) {
                            // Continue with the remaining providers.
                        }
                    }
                    if (bestLocation != null) {
                        resolve(bestLocation);
                        return;
                    }
                }

                boolean listening = false;
                for (String provider : providers) {
                    try {
                        manager.requestSingleUpdate(provider, this, Looper.getMainLooper());
                        listening = true;
                    } catch (SecurityException ignored) {
                        reject("Permesso posizione non concesso", "MOTRICE_LOCATION_PERMISSION_REQUIRED");
                        return;
                    } catch (IllegalArgumentException ignored) {
                        // Provider disappeared between discovery and subscription.
                    } catch (RuntimeException ignored) {
                        // A broken provider must not close the application.
                    }
                }

                if (!listening) {
                    reject("Nessun provider di posizione disponibile", "MOTRICE_POSITION_UNAVAILABLE");
                    return;
                }
                mainHandler.postDelayed(timeoutAction, timeoutMs);
            });
        }

        @Override
        public void onLocationChanged(Location location) {
            if (isBetterLocation(location, bestLocation)) bestLocation = location;
            if (location != null) resolve(location);
        }

        @Override
        public void onProviderDisabled(String provider) {
            // The other provider may still return a valid position.
        }

        @Override
        public void onProviderEnabled(String provider) {
            // No action required.
        }

        @Override
        public void onStatusChanged(String provider, int status, Bundle extras) {
            // Deprecated on newer Android versions, retained for older devices.
        }

        void resolve(Location location) {
            if (!finished.compareAndSet(false, true)) return;
            cleanup();
            call.resolve(positionResult(location));
        }

        void reject(String message, String code) {
            if (!finished.compareAndSet(false, true)) return;
            cleanup();
            call.reject(message, code);
        }

        void cancel() {
            if (!finished.compareAndSet(false, true)) return;
            cleanup();
        }

        void cleanup() {
            mainHandler.removeCallbacks(timeoutAction);
            try {
                manager.removeUpdates(this);
            } catch (RuntimeException ignored) {
                // Cleanup must never crash the host activity.
            }
            activeLocationRequests.remove(this);
        }
    }

    @PluginMethod
    public void startTracking(PluginCall call) {
        boolean hasFine = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean hasCoarse = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        if (!hasFine && !hasCoarse) {
            call.reject("Permesso posizione non concesso");
            return;
        }

        requestNotificationPermissionIfNeeded();

        String eventId = call.getString("eventId", "");
        Double latitude = call.getDouble("latitude");
        Double longitude = call.getDouble("longitude");
        Double expectedEndAt = call.getDouble("expectedEndAtMs");
        if (eventId.isEmpty() || latitude == null || longitude == null || expectedEndAt == null) {
            call.reject("Configurazione monitoraggio incompleta");
            return;
        }

        EventLocationService.saveConfiguration(
                getContext(),
                eventId,
                call.getString("eventTitle", "Evento Motrice"),
                latitude,
                longitude,
                call.getDouble("radiusM", 250.0),
                expectedEndAt.longValue(),
                call.getString("serverUrl", ""),
                call.getString("anonKey", ""),
                call.getString("accessToken", ""),
                call.getString("refreshToken", ""),
                Math.max(5000L, call.getDouble("intervalMs", 60000.0).longValue()),
                call.getString("activityKind", "")
        );

        Intent intent = new Intent(getContext(), EventLocationService.class);
        intent.setAction(EventLocationService.ACTION_START);
        ContextCompat.startForegroundService(getContext(), intent);

        JSObject result = new JSObject();
        result.put("active", true);
        result.put("eventId", eventId);
        call.resolve(result);
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        boolean alreadyAsked = getContext()
                .getSharedPreferences("motrice_runtime_permissions", 0)
                .getBoolean("notificationAsked", false);
        if (alreadyAsked || getActivity() == null) return;
        getContext().getSharedPreferences("motrice_runtime_permissions", 0)
                .edit()
                .putBoolean("notificationAsked", true)
                .apply();
        getActivity().runOnUiThread(() -> ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                6210
        ));
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        EventLocationService.markStopped(getContext(), Boolean.TRUE.equals(call.getBoolean("clearCredentials", false)));
        Intent intent = new Intent(getContext(), EventLocationService.class);
        intent.setAction(EventLocationService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve(EventLocationService.readStatus(getContext()));
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(EventLocationService.readStatus(getContext()));
    }

    @PluginMethod
    public void setActivityPaused(PluginCall call) {
        EventLocationService.setActivityPaused(
                getContext(),
                Boolean.TRUE.equals(call.getBoolean("paused", false))
        );
        call.resolve(EventLocationService.readStatus(getContext()));
    }

    @PluginMethod
    public void getPendingPings(PluginCall call) {
        JSObject result = new JSObject();
        result.put("pings", EventLocationService.readPendingPings(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void ackPings(PluginCall call) {
        JSArray values = call.getArray("ids", new JSArray());
        Set<String> ids = new HashSet<>();
        try {
            for (int index = 0; index < values.length(); index += 1) {
                ids.add(values.getString(index));
            }
        } catch (JSONException error) {
            call.reject("Elenco campioni non valido", error);
            return;
        }
        EventLocationService.ackPendingPings(getContext(), ids);
        call.resolve(EventLocationService.readStatus(getContext()));
    }
}
