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
import java.io.File;

/**
 * Foreground Service do Nó Dedicado Vox Populi: opera infraestrutura comunitária em segundo plano.
 * Tenta carregar a biblioteca nativa {@code libvox_node.so} ({@code rust/vox-node}, ADR-039 PR4.4)
 * e faz fallback gracioso caso a {@code .so} não esteja empacotada no ambiente local.
 */
public class VoxPopuliNodeService extends Service {

    public static final String CHANNEL_ID = "vox_populi_node_channel";
    public static final int NOTIF_ID = 2001;
    public static final String ACTION_TOGGLE = "org.vox.populi.ACTION_TOGGLE";
    public static final String DEFAULT_NODE_MODE = "memoria";
    public static final int DEFAULT_NODE_PORT = 3921;

    private static final boolean NATIVE_LOADED;

    static {
        boolean loaded = false;
        try {
            System.loadLibrary("vox_node");
            loaded = true;
        } catch (UnsatisfiedLinkError ignored) {
            loaded = false;
        }
        NATIVE_LOADED = loaded;
    }

    private static native int nativeStart(String mode, String dataDir, int port);
    private static native int nativePort();
    private static native String nativeHealthJson();
    private static native int nativeStop();

    private boolean isPaused = false;
    private boolean nativeRunning = false;

    public static boolean isNativeLoaded() {
        return NATIVE_LOADED;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startInForeground();
        startNativeNodeIfReady();
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
            if (isPaused) {
                stopNativeNode();
            } else {
                startNativeNodeIfReady();
            }
            updateNotification();
        }
        return START_STICKY;
    }

    private void startNativeNodeIfReady() {
        if (!NATIVE_LOADED || nativeRunning || isPaused || !NodeNetworkGuard.isWifiConnected(this)) {
            return;
        }
        try {
            File dataDir = new File(getFilesDir(), "vox-node");
            int rc = nativeStart(DEFAULT_NODE_MODE, dataDir.getAbsolutePath(), DEFAULT_NODE_PORT);
            nativeRunning = (rc == 0);
        } catch (UnsatisfiedLinkError ignored) {
            nativeRunning = false;
        }
    }

    private void stopNativeNode() {
        if (!NATIVE_LOADED || !nativeRunning) {
            return;
        }
        try {
            nativeStop();
        } catch (UnsatisfiedLinkError ignored) {
            // Fallback gracioso caso o símbolo JNI não esteja disponível.
        } finally {
            nativeRunning = false;
        }
    }

    public int getNativePort() {
        if (!NATIVE_LOADED || !nativeRunning) {
            return 0;
        }
        try {
            return nativePort();
        } catch (UnsatisfiedLinkError ignored) {
            return 0;
        }
    }

    public String getNativeHealthJson() {
        if (!NATIVE_LOADED || !nativeRunning) {
            return null;
        }
        try {
            return nativeHealthJson();
        } catch (UnsatisfiedLinkError ignored) {
            return null;
        }
    }

    private void updateNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIF_ID, buildNotification());
        }
    }

    @Override
    public void onDestroy() {
        stopNativeNode();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
