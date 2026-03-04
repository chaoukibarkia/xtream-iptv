package zb.zebra.Util;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import zb.zebra.MenuActivity;

public class RunOnStartup extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent.getAction().equals(Intent.ACTION_BOOT_COMPLETED)) {
            Intent i = new Intent(context, MenuActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(i);
        }
    }

}