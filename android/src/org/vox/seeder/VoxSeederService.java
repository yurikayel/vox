package org.vox.seeder;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * Foreground Service que mantém a malha P2P/WebRTC ativa mesmo com a tela apagada.
 */
public class VoxSeederService extends Service {

    public static final String CHANNEL_ID = "vox_seeder_channel";
    public static final int NOTIF_ID = 1001;
    private static final String SEED_URL = "https://vox-9df.pages.dev/#/status";

    private WebView backgroundWorker;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startInForeground();
        initBackgroundWorker();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = getString(R.string.channel_name);
            String desc = getString(R.string.channel_desc);
            NotificationChannel chan = new NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_LOW);
            chan.setDescription(desc);
            chan.setShowBadge(false);

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(chan);
        }
    }

    private void startInForeground() {
        Intent tap = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tap,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        boolean wifi = NetworkGuard.isWifiConnected(this);
        String text = wifi ? getString(R.string.notif_desc_wifi) : getString(R.string.notif_desc_paused);

        Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        Notification notif = b.setContentTitle(getString(R.string.notif_title))
                .setContentText(text)
                .setSmallIcon(R.drawable.ic_vox_seeder)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();

        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_ID, notif);
        }
    }

    private void initBackgroundWorker() {
        try {
            backgroundWorker = new WebView(this);
            WebSettings s = backgroundWorker.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setDatabaseEnabled(true);
            backgroundWorker.loadUrl(SEED_URL);
        } catch (Exception ignored) {
            // Se ambiente restrito, segue com o serviço ativo
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (backgroundWorker != null) {
            backgroundWorker.destroy();
            backgroundWorker = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
