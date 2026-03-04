package zb.zebra.Util;

import android.app.Activity;
import android.os.Environment;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Created by medbenhamed on 04/04/18.
 */

public class ExternalStorageManager {
    /* Checks if external storage is available for read and write */
    public static boolean isExternalStorageWritable() {
        String state = Environment.getExternalStorageState();
        if (Environment.MEDIA_MOUNTED.equals(state)) {
            return true;
        }
        return false;
    }

    /* Checks if external storage is available to at least read */
    public static boolean isExternalStorageReadable() {
        String state = Environment.getExternalStorageState();
        if (Environment.MEDIA_MOUNTED.equals(state) ||
                Environment.MEDIA_MOUNTED_READ_ONLY.equals(state)) {
            return true;
        }
        return false;
    }


    public static JSONObject readCache(Activity mcontext){
        String myData = "";
        File myExternalFile;
        myExternalFile = new File(mcontext.getExternalFilesDir("Zebra"), "zebra.fav");
        try {
            FileInputStream fis = new FileInputStream(myExternalFile);
            DataInputStream in = new DataInputStream(fis);
            BufferedReader br =
                    new BufferedReader(new InputStreamReader(in));
            String strLine;
            while ((strLine = br.readLine()) != null) {
                myData = myData + strLine;
            }
            in.close();
            Log.e("myData",myData);
            return new JSONObject(myData);
        } catch (IOException e) {
            e.printStackTrace();
        } catch (JSONException e) {
            e.printStackTrace();
            try {
            FileOutputStream fos = new FileOutputStream(myExternalFile);


                fos.write(new String("{}").getBytes());


                fos.close();
            } catch (IOException e1) {
                e1.printStackTrace();

            }
        }
        try {
        FileOutputStream fos = new FileOutputStream(myExternalFile);

            fos.write(new String("{}").getBytes());

        fos.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
        return new JSONObject();
    }

    public static void writeCache(Activity mcontext,JSONObject jsonObject){
        File myExternalFile;
        myExternalFile = new File(mcontext.getExternalFilesDir("Zebra"), "zebra.fav");

        try {
            Log.e("dddd",jsonObject.toString());
            FileOutputStream fos = new FileOutputStream(myExternalFile);

            fos.write(jsonObject.toString().getBytes());

            fos.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
