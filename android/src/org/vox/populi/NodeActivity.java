package org.vox.populi;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Interface nativa do Nó Dedicado Vox Populi: exibe status de relay/cache e controles de infraestrutura.
 */
public class NodeActivity extends Activity {

    private TextView statusValue;
    private TextView networkValue;
    private TextView boostValue;
    private Button toggleButton;
    private boolean isNodePaused = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startNodeService();

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.parseColor("#0B0F17"));
        scroll.setFillViewport(true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(36, 48, 36, 48);

        root.addView(createHeaderView());
        root.addView(createCardView());
        root.addView(createControlsView());

        scroll.addView(root);
        setContentView(scroll);
        refreshUI();
    }

    private void startNodeService() {
        Intent srv = new Intent(this, VoxPopuliNodeService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(srv);
        } else {
            startService(srv);
        }
    }

    private View createHeaderView() {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(0, 0, 0, 36);

        TextView title = new TextView(this);
        title.setText("Vox Populi");
        title.setTextSize(26);
        title.setTextColor(Color.parseColor("#F8FAFC"));
        title.setTypeface(Typeface.DEFAULT_BOLD);

        TextView subtitle = new TextView(this);
        subtitle.setText("Nó Dedicado de Infraestrutura Comunitária");
        subtitle.setTextSize(14);
        subtitle.setTextColor(Color.parseColor("#94A3B8"));
        subtitle.setPadding(0, 6, 0, 0);

        header.addView(title);
        header.addView(subtitle);
        return header;
    }

    private View createCardView() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackgroundColor(Color.parseColor("#161E2E"));
        card.setPadding(32, 32, 32, 32);

        statusValue = addRow(card, "Status do Nó:", "Ativo (Relay & Cache)");
        networkValue = addRow(card, "Rede:", "Wi-Fi Seguro");
        boostValue = addRow(card, "Sinergia:", "Boost disponível para o Cliente Vox");

        TextView info = new TextView(this);
        info.setText("Relay local em loopback 127.0.0.1:3921. Sem exposição pública de portas.");
        info.setTextSize(12);
        info.setTextColor(Color.parseColor("#64748B"));
        info.setPadding(0, 24, 0, 0);
        card.addView(info);

        return card;
    }

    private TextView addRow(LinearLayout parent, String label, String initialValue) {
        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextSize(13);
        labelView.setTextColor(Color.parseColor("#94A3B8"));
        labelView.setPadding(0, 12, 0, 2);

        TextView valView = new TextView(this);
        valView.setText(initialValue);
        valView.setTextSize(15);
        valView.setTextColor(Color.parseColor("#38BDF8"));
        valView.setTypeface(Typeface.DEFAULT_BOLD);

        parent.addView(labelView);
        parent.addView(valView);
        return valView;
    }

    private View createControlsView() {
        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setPadding(0, 36, 0, 0);

        toggleButton = new Button(this);
        toggleButton.setText("Pausar Nó Dedicado");
        toggleButton.setTextColor(Color.WHITE);
        toggleButton.setBackgroundColor(Color.parseColor("#2563EB"));
        toggleButton.setOnClickListener(v -> toggleNode());

        Button openClientBtn = new Button(this);
        openClientBtn.setText("Abrir Cliente Vox");
        openClientBtn.setTextColor(Color.WHITE);
        openClientBtn.setBackgroundColor(Color.parseColor("#1E293B"));
        openClientBtn.setOnClickListener(v -> openClientApp());

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 0, 0, 16);
        controls.addView(toggleButton, lp);
        controls.addView(openClientBtn, lp);
        return controls;
    }

    private void toggleNode() {
        isNodePaused = !isNodePaused;
        Intent intent = new Intent(this, VoxPopuliNodeService.class);
        intent.setAction(VoxPopuliNodeService.ACTION_TOGGLE);
        startService(intent);
        refreshUI();
    }

    private void refreshUI() {
        boolean wifi = NodeNetworkGuard.isWifiConnected(this);
        if (isNodePaused) {
            statusValue.setText("Pausado Manualmente");
            statusValue.setTextColor(Color.parseColor("#F59E0B"));
            toggleButton.setText("Retomar Nó Dedicado");
            toggleButton.setBackgroundColor(Color.parseColor("#10B981"));
        } else if (wifi) {
            statusValue.setText("Ativo (Relay & Cache)");
            statusValue.setTextColor(Color.parseColor("#10B981"));
            toggleButton.setText("Pausar Nó Dedicado");
            toggleButton.setBackgroundColor(Color.parseColor("#2563EB"));
        } else {
            statusValue.setText("Pausado (Aguardando Wi-Fi)");
            statusValue.setTextColor(Color.parseColor("#F59E0B"));
        }
        networkValue.setText(wifi ? "Wi-Fi Ativo" : "Rede Celular / Offline");
    }

    private void openClientApp() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage("org.vox.client");
        if (launchIntent != null) {
            startActivity(launchIntent);
        } else {
            Intent browserIntent = new Intent(Intent.ACTION_VIEW,
                    android.net.Uri.parse("https://vox-9df.pages.dev/"));
            startActivity(browserIntent);
        }
    }
}
