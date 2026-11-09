package com.nikcirri.nutrizione;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Aggiornamento dentro l'app: scarica l'APK della nuova versione da GitHub e apre l'installazione di Android.
 * Accetta solo indirizzi delle Release di questo repository.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String ALLOWED_PREFIX = "https://github.com/Nikcirri/nutrizione/releases/download/";
    private static final long MIN_APK_BYTES = 1_000_000L;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean downloading = false;

    /** Android permette a questa app di installare aggiornamenti? (Impostazione "Installa app sconosciute"). */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    /** Apre l'impostazione "Installa app sconosciute" di questa app. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            } else {
                intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Non riesco ad aprire le impostazioni: " + e.getMessage());
        }
    }

    /** Scarica l'APK (avvisando l'avanzamento con l'evento "progress") e apre l'installazione. */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith(ALLOWED_PREFIX) || !url.endsWith(".apk")) {
            call.reject("Indirizzo dell'aggiornamento non valido");
            return;
        }
        if (downloading) {
            call.reject("Sto già scaricando l'aggiornamento");
            return;
        }
        downloading = true;
        executor.execute(() -> {
            try {
                File apk = download(url);
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(intent);
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("Non riesco ad aprire l'installazione: " + e.getMessage());
                    }
                });
            } catch (Exception e) {
                call.reject("Download non riuscito: " + e.getMessage());
            } finally {
                downloading = false;
            }
        });
    }

    private File download(String address) throws IOException {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("cartella non disponibile");
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        File apk = new File(dir, "Nutrizione-aggiornamento.apk");

        HttpURLConnection conn = null;
        try {
            // GitHub rimanda a un altro indirizzo (sempre https): si seguono fino a 5 passaggi.
            URL url = new URL(address);
            for (int i = 0; i < 5; i++) {
                conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(15_000);
                conn.setReadTimeout(30_000);
                conn.setRequestProperty("User-Agent", "Nutrizione-Android");
                int code = conn.getResponseCode();
                if (code >= 300 && code < 400) {
                    String location = conn.getHeaderField("Location");
                    conn.disconnect();
                    if (location == null) throw new IOException("redirect senza indirizzo");
                    url = new URL(url, location);
                    if (!"https".equals(url.getProtocol())) throw new IOException("indirizzo non sicuro");
                    continue;
                }
                if (code != HttpURLConnection.HTTP_OK) throw new IOException("HTTP " + code);
                break;
            }
            if (conn == null) throw new IOException("nessuna connessione");
            long total = conn.getContentLengthLong();
            long done = 0;
            int lastPercent = -1;
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    out.write(buffer, 0, n);
                    done += n;
                    if (total > 0) {
                        int percent = (int) Math.min(100, (done * 100) / total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject progress = new JSObject();
                            progress.put("percent", percent);
                            notifyListeners("progress", progress);
                        }
                    }
                }
            }
            if (apk.length() < MIN_APK_BYTES || (total > 0 && apk.length() != total)) {
                throw new IOException("file incompleto");
            }
            return apk;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
