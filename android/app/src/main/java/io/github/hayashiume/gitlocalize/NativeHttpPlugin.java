package io.github.hayashiume.gitlocalize;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Carries git's smart-HTTP traffic from the native side. The WebView cannot do it: GitHub returns
 * no CORS headers on those endpoints, and CapacitorHttp silently corrupts a binary request body.
 * Bodies cross the bridge as Base64 in both directions so bytes survive intact.
 */
@CapacitorPlugin(name = "NativeHttp")
public class NativeHttpPlugin extends Plugin {

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("url is required");
            return;
        }
        String method = call.getString("method", "GET");
        String bodyBase64 = call.getString("bodyBase64");

        JSObject headers = call.getObject("headers");
        if (headers == null) headers = new JSObject();

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(180000);

            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                connection.setRequestProperty(key, headers.getString(key));
            }

            if (bodyBase64 != null && !bodyBase64.isEmpty()) {
                connection.setDoOutput(true);
                OutputStream out = connection.getOutputStream();
                out.write(Base64.decode(bodyBase64, Base64.DEFAULT));
                out.flush();
                out.close();
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            if (stream != null) {
                byte[] chunk = new byte[16384];
                int read;
                while ((read = stream.read(chunk)) != -1) buffer.write(chunk, 0, read);
                stream.close();
            }

            /* fetch() lower-cases header names, and isomorphic-git looks them up that way. */
            JSObject responseHeaders = new JSObject();
            for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
                String name = entry.getKey();
                List<String> values = entry.getValue();
                if (name == null || values == null || values.isEmpty()) continue;
                responseHeaders.put(name.toLowerCase(Locale.ROOT), values.get(0));
            }

            JSObject result = new JSObject();
            result.put("status", status);
            result.put("headers", responseHeaders);
            result.put("bodyBase64", Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "request failed" : error.getMessage(), error);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
