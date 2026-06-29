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
