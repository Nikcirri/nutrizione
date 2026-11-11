package com.nikcirri.nutrizione.widgets;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Riceve i tocchi sui pulsanti − e + del widget "Sigarette" e i segnali del cambio di giorno.
 * Non è raggiungibile da altre app (exported="false" nel manifest): solo da questa app e da Android.
 */
public class WidgetActionReceiver extends BroadcastReceiver {

    static final String ACTION_CIG_PLUS = "com.nikcirri.nutrizione.widget.CIG_PLUS";
    static final String ACTION_CIG_MINUS = "com.nikcirri.nutrizione.widget.CIG_MINUS";
    /** Giorno cambiato: i widget passano alla giornata nuova (sveglia normale). */
    static final String ACTION_REFRESH = "com.nikcirri.nutrizione.widget.REFRESH";
    /** Lo stesso, con la sveglia che suona anche a telefono fermo da ore. */
    static final String ACTION_REFRESH_IDLE = "com.nikcirri.nutrizione.widget.REFRESH_IDLE";

    private static final long TEN_MINUTES = 10 * 60 * 1000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_CIG_PLUS.equals(action)) {
            WidgetStore.changeCigarettes(context, WidgetStore.today(), 1);
        } else if (ACTION_CIG_MINUS.equals(action)) {
            WidgetStore.changeCigarettes(context, WidgetStore.today(), -1);
        } else {
            // Mezzanotte passata, oppure ora o fuso orario cambiati.
            WidgetStore.prune(context);
        }
        // Si ridisegnano sempre tutti e due: se nel frattempo è cambiato giorno, si aggiornano insieme.
        CigaretteWidget.updateAll(context);
        CaloriesWidget.updateAll(context);
        scheduleMidnight(context);
    }

    /** Intent verso questo ricevitore, da collegare a un pulsante di un widget o a una sveglia. */
    static PendingIntent pending(Context context, String action) {
        Intent intent = new Intent(context, WidgetActionReceiver.class);
        intent.setAction(action);
        // Consegna con priorità: il numero cambia subito dopo il tocco.
        intent.addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Prepara l'aggiornamento dei widget per la prossima mezzanotte, quando la giornata riparte da zero.
     * Due sveglie, perché da sola quella "silenziosa" su alcuni telefoni non è partita:
     * - una normale, entro dieci minuti da mezzanotte, per quando il telefono è in uso;
     * - una che suona anche se il telefono è fermo da ore (risparmio energetico), svegliandolo per un attimo.
     * In più Android ridisegna i widget ogni 30 minuti (updatePeriodMillis), come riserva.
     * Senza widget sulla schermata Home le sveglie si spengono.
     */
    static void scheduleMidnight(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent refresh = pending(context, ACTION_REFRESH);
        PendingIntent refreshIdle = pending(context, ACTION_REFRESH_IDLE);
        if (CaloriesWidget.ids(context).length == 0 && CigaretteWidget.ids(context).length == 0) {
            alarms.cancel(refresh);
            alarms.cancel(refreshIdle);
            return;
        }
        long midnight = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
        alarms.setWindow(AlarmManager.RTC_WAKEUP, midnight + 1000L, TEN_MINUTES, refresh);
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, midnight + 5000L, refreshIdle);
    }
}
