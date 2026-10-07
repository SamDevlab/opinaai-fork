package br.com.grupotec.opinaai;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "OpinaRuntime")
public class OpinaRuntimePlugin extends Plugin {
    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject info = new JSObject();
        info.put("platform", "android");
        info.put("androidVersion", Build.VERSION.RELEASE);
        info.put("manufacturer", Build.MANUFACTURER);
        info.put("model", Build.MODEL);
        info.put("orientation", orientation());
        info.put("kioskState", "active");

        BatterySnapshot battery = battery();
        info.put("batteryLevel", battery.level);
        info.put("charging", battery.charging);
        info.put("networkState", networkState());
        call.resolve(info);
    }

    private String orientation() {
        int value = getContext().getResources().getConfiguration().orientation;
        if (value == Configuration.ORIENTATION_PORTRAIT) return "portrait";
        if (value == Configuration.ORIENTATION_LANDSCAPE) return "landscape";
        return "unknown";
    }

    private BatterySnapshot battery() {
        Intent batteryIntent = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (batteryIntent == null) return new BatterySnapshot(null, null);
        int level = batteryIntent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = batteryIntent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        Integer percentage = level >= 0 && scale > 0 ? Math.round((level * 100f) / scale) : null;
        int status = batteryIntent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL;
        return new BatterySnapshot(percentage, charging);
    }

    private String networkState() {
        ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return "unknown";
        Network network = manager.getActiveNetwork();
        NetworkCapabilities capabilities = network == null ? null : manager.getNetworkCapabilities(network);
        if (capabilities == null) return "offline";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "wifi";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "ethernet";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "cellular";
        return "online";
    }

    private static class BatterySnapshot {
        private final Integer level;
        private final Boolean charging;

        private BatterySnapshot(Integer level, Boolean charging) {
            this.level = level;
            this.charging = charging;
        }
    }
}
