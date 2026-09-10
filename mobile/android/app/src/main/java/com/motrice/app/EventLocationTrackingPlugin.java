package com.motrice.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

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

import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(name = "EventLocationTracking")
public class EventLocationTrackingPlugin extends Plugin {

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
