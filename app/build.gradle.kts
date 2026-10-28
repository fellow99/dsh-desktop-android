plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "org.fellow99.dsh.android"
    compileSdk = 36
    // 本机已装 36.0.0；避免 AGP 自动下载 35.x（SDK 下载器不走代理会拿到坏包）
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "org.fellow99.dsh.android"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        // A14：引擎只有 arm64-v8a；x86_64/模拟器明确不支持
        ndk {
            abiFilters += "arm64-v8a"
        }
    }

    flavorDimensions += "dist"
    productFlavors {
        create("full") {
            dimension = "dist"
            buildConfigField("String", "DSH_STORAGE_MODE", "\"full\"")
        }
        create("store") {
            dimension = "dist"
            buildConfigField("String", "DSH_STORAGE_MODE", "\"sandbox-only\"")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        jniLibs {
            // A15/G12：.so 不压缩入包（16 KB 对齐前提）
            useLegacyPackaging = false
        }
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // JNI 桥：Kotlin API + libnode_bridge.so + libnode_host_client.so + 引导 JS（Maven Central）
    implementation("io.github.fellow99:node-bridge:0.2.0")
    // 引擎 libnode.so + libc++_shared.so 由 scripts/provision-engine.mjs 投放到 src/main/jniLibs（不入库）；
    // 来源 aosp-node-runtime v24.22.1（runtime.lock.json 锁 sha256，八项 ELF 门禁）。
}
