import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The signing key lives OUTSIDE this (public) repo. Every APK must be signed
// with the same key, or phones refuse to install it as an update.
val signingFile = rootProject.file(System.getenv("RAY_SIGNING") ?: "../../android-signing/keystore.properties")

android {
    namespace = "com.theray.bill"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.theray.bill"
        minSdk = 24
        targetSdk = 35
        versionCode = 3
        versionName = "1.0.2"
        buildConfigField("String", "APP_URL", "\"https://bill.theray.in\"")
    }

    signingConfigs {
        if (signingFile.exists()) {
            create("release") {
                val p = Properties().apply { signingFile.inputStream().use { load(it) } }
                storeFile = File(signingFile.parentFile, p.getProperty("storeFile"))
                storePassword = p.getProperty("storePassword")
                keyAlias = p.getProperty("keyAlias")
                keyPassword = p.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core:1.13.1")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
}
