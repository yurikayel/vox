package org.vox.populi;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Foreground Service do Nó Dedicado Vox Populi: opera infraestrutura comunitária em segundo plano.
 */
public class VoxPopuliNodeService extends Service {

    public static final String CHANNEL_ID = "vox_populi_node_channel";
    public static final int NOTIF_ID = 2001;
    public static final String ACTION_TOGGLE = "org.vox.populi.ACTION_TOGGLE";

    private boolean isPaused = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startInForeground();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = getString(R.string.channel_node_name);
            String desc = getString(R.string.channel_node_desc);
            NotificationChannel chan = new NotificationChannel(
                    CHANNEL_ID, name, NotificationManager.IMPORTANCE_LOW);
            chan.setDescription(desc);
            chan.setShowBadge(false);

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(chan);
            }
        }
    }

    private void startInForeground() {
        Notification notif = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_ID, notif);
        }
    }

    private Notification buildNotification() {
        Intent tap = new Intent(this, NodeActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tap,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        boolean wifi = NodeNetworkGuard.isWifiConnected(this);
        String text;
        if (isPaused) {
            text = "Nó pausado manualmente";
        } else if (wifi) {
            text = getString(R.string.notif_node_desc_active);
        } else {
            text = getString(R.string.notif_node_desc_paused);
        }

        Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        return b.setContentTitle(getString(R.string.notif_node_title))
                .setContentText(text)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_TOGGLE.equals(intent.getAction())) {
            isPaused = !isPaused;
            updateNotification();
        }
        return START_STICKY;
    }

    private void updateNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIF_ID, buildNotification());
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
