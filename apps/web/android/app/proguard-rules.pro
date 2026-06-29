# Capacitor — conservar clases del bridge WebView
-keep class com.getcapacitor.** { *; }
-keep class co.transpadilla.app.** { *; }

# Background Geolocation plugin
-keep class com.equimaps.capacitorbackgroundgeolocation.** { *; }

# Cordova plugins bridge
-keep class org.apache.cordova.** { *; }

# Evitar que R8 elimine anotaciones de Kotlin/AndroidX
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions

# WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Suprimir avisos de librerías de terceros
-dontwarn org.apache.cordova.**
-dontwarn com.getcapacitor.**

# Eliminar todas las llamadas a Log.* en release (no dejar trazas en logcat)
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int i(...);
    public static int w(...);
    public static int d(...);
    public static int e(...);
}

# Ofuscación agresiva: renombrar clases y métodos internos
-repackageclasses 'co.transpadilla.internal'
-allowaccessmodification
-overloadaggressively

# Eliminar atributos de depuración del bytecode
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable
