package br.com.grupotec.opinaai;

import android.content.SharedPreferences;
import android.util.Base64;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

@CapacitorPlugin(name = "OpinaSecureStorage")
public class OpinaSecureStoragePlugin extends Plugin {
    private static final String PREFS = "opina_secure_storage";
    private static final String KEY_ALIAS = "opina_device_secret_v1";
    private static final String VALUE_PREFIX = "value_";
    private static final int GCM_TAG_BITS = 128;

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, 0);
    }

    private SecretKey key() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (!keyStore.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build());
            generator.generateKey();
        }
        return ((SecretKey) keyStore.getKey(KEY_ALIAS, null));
    }

    @PluginMethod
    public void get(PluginCall call) {
        String name = call.getString("key");
        if (name == null || name.isBlank()) {
            call.reject("key_required");
            return;
        }
        String encoded = preferences().getString(VALUE_PREFIX + name, null);
        JSObject result = new JSObject();
        try {
            result.put("value", encoded == null ? null : decrypt(encoded));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("secure_storage_read_failed", error);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String name = call.getString("key");
        String value = call.getString("value");
        if (name == null || name.isBlank() || value == null) {
            call.reject("key_and_value_required");
            return;
        }
        try {
            preferences().edit().putString(VALUE_PREFIX + name, encrypt(value)).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("secure_storage_write_failed", error);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String name = call.getString("key");
        if (name == null || name.isBlank()) {
            call.reject("key_required");
            return;
        }
        preferences().edit().remove(VALUE_PREFIX + name).apply();
        call.resolve();
    }

    private String encrypt(@NonNull String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] packed = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, packed, 0, iv.length);
        System.arraycopy(ciphertext, 0, packed, iv.length, ciphertext.length);
        return Base64.encodeToString(packed, Base64.NO_WRAP);
    }

    private String decrypt(@NonNull String encoded) throws Exception {
        byte[] packed = Base64.decode(encoded, Base64.NO_WRAP);
        byte[] iv = new byte[12];
        byte[] ciphertext = new byte[packed.length - iv.length];
        System.arraycopy(packed, 0, iv, 0, iv.length);
        System.arraycopy(packed, iv.length, ciphertext, 0, ciphertext.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }
}
