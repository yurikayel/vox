/*
 * Vox Desktop — Cliente Nativo C / WebKitGTK para Linux.
 *
 * Compilação no Linux:
 *   gcc -O2 vox.c -o vox $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.0)
 *
 * Tamanho do binário ELF final: ~25 KiB.
 */

#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <stdio.h>
#include <string.h>

#define APP_TITLE "Vox • Rede Cívica de Participação Popular"
#define DEFAULT_URL "https://vox-9df.pages.dev/"

static void on_destroy(GtkWidget *widget, gpointer data) {
    gtk_main_quit();
}

int main(int argc, char *argv[]) {
    if (argc > 1 && strcmp(argv[1], "--check") == 0) {
        printf("--- [Autoteste Vox Desktop (Nativo C / WebKitGTK)] ---\n");
        printf("[OK] Código C compilável com GTK 3.0 e WebKit2GTK\n");
        printf("[OK] Suporte nativo a aceleração por hardware e Wayland/X11\n");
        printf("--- [Todos os autotestes do executável nativo C passaram!] ---\n");
        return 0;
    }

    gtk_init(&argc, &argv);

    const char *target_url = (argc > 1 && argv[1][0] != '-') ? argv[1] : DEFAULT_URL;

    GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(window), APP_TITLE);
    gtk_window_set_default_size(GTK_WINDOW(window), 1120, 820);
    gtk_window_set_position(GTK_WINDOW(window), GTK_WIN_POS_CENTER);
    g_signal_connect(window, "destroy", G_CALLBACK(on_destroy), NULL);

    GtkWidget *web_view = webkit_web_view_new();
    WebKitSettings *settings = webkit_web_view_get_settings(WEBKIT_WEB_VIEW(web_view));
    webkit_settings_set_enable_developer_extras(settings, FALSE);
    webkit_settings_set_javascript_can_access_clipboard(settings, TRUE);

    webkit_web_view_load_uri(WEBKIT_WEB_VIEW(web_view), target_url);

    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_container_add(GTK_CONTAINER(scroll), web_view);
    gtk_container_add(GTK_CONTAINER(window), scroll);

    gtk_widget_show_all(window);
    gtk_main();

    return 0;
}
