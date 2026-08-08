import { FamilyMember, Medication, DoseLog, OnboardingSlide, AndroidProjectFile } from '../types';

export const INITIAL_FAMILY_MEMBERS: FamilyMember[] = [
  {
    id: 'me',
    name: 'علی (من)',
    relation: 'من',
    avatarColor: '#3b82f6',
    bgGradient: 'from-blue-500 to-indigo-600',
    todayStatus: 'completed',
    todayStatusText: 'تمام داروهای امروز مصرف شده ✅',
    adherenceRate: 98
  },
  {
    id: 'mother',
    name: 'طاهره رضایی',
    relation: 'مادر',
    avatarColor: '#10b981',
    bgGradient: 'from-emerald-500 to-teal-600',
    todayStatus: 'completed',
    todayStatusText: 'مامان امروز دارویش را مصرف کرده ✅',
    adherenceRate: 94
  },
  {
    id: 'father',
    name: 'محمود امیری',
    relation: 'پدر',
    avatarColor: '#f59e0b',
    bgGradient: 'from-amber-500 to-orange-600',
    todayStatus: 'pending',
    todayStatusText: '۱ نوبت از داروهای امروز باقیمانده ⏰',
    adherenceRate: 88
  },
  {
    id: 'child',
    name: 'سارا (دخترم)',
    relation: 'کودک',
    avatarColor: '#ec4899',
    bgGradient: 'from-pink-500 to-rose-600',
    todayStatus: 'completed',
    todayStatusText: 'شربت سرماخوردگی بموقع مصرف شد ✅',
    adherenceRate: 100
  }
];

export const INITIAL_MEDICATIONS: Medication[] = [];

export const INITIAL_DOSE_LOGS: DoseLog[] = [];

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: 1,
    title: 'تو دیگه داروهاتو فراموش نمی‌کنی',
    description: 'داروتو با یادآورهای هوشمند، درست سر وقت بهت خبر می‌ده که نوبت مصرف کدوم داروئه.',
    illustration: 'reminders'
  },
  {
    id: 2,
    title: 'اکثر داروهای پرکاربرد اینجا جمع شدن',
    description: 'صدها داروی رایج به همراه راهنمای مصرفشون توی بانک داروییِ داروتو در دسترسته؛ خیالت راحت باشه.',
    illustration: 'medicationBank'
  },
  {
    id: 3,
    title: 'تداخلات دارویی رو هم برات بررسی می‌کنیم',
    description: 'قبل از مصرف چند دارو با هم، داروتو تداخل احتمالی بینشون رو برات چک می‌کنه.',
    illustration: 'interactions'
  }
];

export const ANDROID_PROJECT_FILES: AndroidProjectFile[] = [
  {
    id: 'build_gradle',
    path: 'app/build.gradle.kts',
    name: 'build.gradle.kts (App Module)',
    language: 'gradle',
    category: 'Gradle & CI/CD',
    description: 'تنظیمات بیلد اندروید، Jetpack Compose، Room، WorkManager و وابستگی‌های Clean Architecture',
    content: `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.ksp)
    alias(libs.plugins.hilt.android)
}

android {
    namespace = "com.darooto.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.darooto.app"
        minSdk = 26 // Android 8.0 Oreo+
        targetSdk = 35
        versionCode = 100
        versionName = "1.0.0-PRO"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
}

dependencies {
    // Jetpack Compose 2026 UI & Material 3
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    // Room Database (Offline First Architecture)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    // WorkManager (Background Reminders & Alarms)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.hilt.work)

    // Dependency Injection (Hilt)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
}`
  },
  {
    id: 'medication_entity',
    path: 'app/src/main/java/com/darooto/app/domain/model/Medication.kt',
    name: 'Medication.kt (Domain Layer)',
    language: 'kotlin',
    category: 'Clean Architecture',
    description: 'مدل دامنه (Domain Model) دارو در معماری تمیز همراه با خصوصیات دوز، زمانبندی و هشدار موجودی',
    content: `package com.darooto.app.domain.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "medications")
data class Medication(
    @PrimaryKey
    val id: String,
    val name: String,
    val form: MedicationForm,
    val dose: String,
    val times: List<String>, // JSON serialized list of times e.g. ["08:00", "21:00"]
    val frequency: String,
    val remainingCount: Int,
    val totalCount: Int,
    val alertThreshold: Int = 5,
    val isActive: Boolean = true,
    val familyMemberId: String = "me",
    val notes: String? = null,
    val instructions: String? = null,
    val createdAtMillis: Long = System.currentTimeMillis()
) {
    val isLowStock: Boolean
        get() = remainingCount <= alertThreshold
}

enum class MedicationForm(val persianName: String, val emoji: String) {
    PILL("قرص", "💊"),
    SYRUP("شربت", "💧"),
    INJECTION("آمپول", "💉"),
    DROPS("قطره", "🧴")
}`
  },
  {
    id: 'room_dao',
    path: 'app/src/main/java/com/darooto/app/data/local/MedicationDao.kt',
    name: 'MedicationDao.kt (Data Layer)',
    language: 'kotlin',
    category: 'Database Room',
    description: 'واسط دسترسی به داده (DAO) در Room Database برای استخراج آفلاین، ذخیره و بروزرسانی داروها',
    content: `package com.darooto.app.data.local

import androidx.room.*
import com.darooto.app.domain.model.Medication
import kotlinx.coroutines.flow.Flow

@Dao
interface MedicationDao {
    @Query("SELECT * FROM medications WHERE isActive = 1 AND familyMemberId = :memberId ORDER BY createdAtMillis DESC")
    fun getActiveMedicationsFlow(memberId: String): Flow<List<Medication>>

    @Query("SELECT * FROM medications WHERE id = :medId")
    suspend fun getMedicationById(medId: String): Medication?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMedication(medication: Medication)

    @Update
    suspend fun updateMedication(medication: Medication)

    @Query("UPDATE medications SET remainingCount = remainingCount - 1 WHERE id = :medId AND remainingCount > 0")
    suspend fun decrementStock(medId: String)

    @Query("SELECT * FROM medications WHERE remainingCount <= alertThreshold AND isActive = 1")
    suspend fun getLowStockMedications(): List<Medication>

    @Delete
    suspend fun deleteMedication(medication: Medication)
}`
  },
  {
    id: 'stacked_cards_ui',
    path: 'app/src/main/java/com/darooto/app/presentation/home/StackedCardsScreen.kt',
    name: 'StackedCardsScreen.kt (UI Layer Compose)',
    language: 'kotlin',
    category: 'UI Compose',
    description: 'پیاده‌سازی کارت‌های روی هم (Card Stack UI) در Jetpack Compose با انیمیشن‌های نرم، ژست سوایپ و Glassmorphism',
    content: `package com.darooto.app.presentation.home

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.darooto.app.domain.model.Medication
import com.darooto.app.ui.theme.VazirmatnFontFamily

@Composable
fun StackedCardsScreen(
    medications: List<Medication>,
    onDoseTaken: (Medication) -> Unit,
    onDoseSkipped: (Medication) -> Unit
) {
    var currentIndex by remember { mutableStateOf(0) }
    var offsetX by remember { mutableStateOf(0f) }
    val animatedOffsetX by animateFloatAsState(targetValue = offsetX, label = "swipe")

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        contentAlignment = Alignment.Center
    ) {
        if (currentIndex >= medications.size) {
            AllDoneCelebrationCard()
        } else {
            // Render underlying stacked cards (Parallax & Scale effect)
            for (i in (medications.size - 1) downTo currentIndex + 1) {
                val depth = i - currentIndex
                if (depth <= 3) {
                    val scale = 1f - (depth * 0.07f)
                    val offsetY = (depth * 24).dp
                    
                    MedicationGlassCard(
                        medication = medications[i],
                        modifier = Modifier
                            .graphicsLayer {
                                scaleX = scale
                                scaleY = scale
                                translationY = offsetY.toPx()
                                alpha = 1f - (depth * 0.2f)
                            }
                            .blur((depth * 2).dp)
                    )
                }
            }

            // Top active card with swipe gesture
            MedicationGlassCard(
                medication = medications[currentIndex],
                modifier = Modifier
                    .graphicsLayer {
                        translationX = animatedOffsetX
                        rotationZ = (animatedOffsetX / 40f)
                    }
                    .pointerInput(Unit) {
                        detectHorizontalDragGestures(
                            onDragEnd = {
                                if (offsetX > 300f) {
                                    onDoseTaken(medications[currentIndex])
                                    currentIndex++
                                } else if (offsetX < -300f) {
                                    onDoseSkipped(medications[currentIndex])
                                    currentIndex++
                                }
                                offsetX = 0f
                            },
                            onHorizontalDrag = { _, dragAmount ->
                                offsetX += dragAmount
                            }
                        )
                    }
            )
        }
    }
}

@Composable
fun MedicationGlassCard(medication: Medication, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier
            .fillMaxWidth(0.9f)
            .height(340.dp),
        shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFFFF).copy(alpha = 0.85f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 12.dp)
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "\${medication.form.emoji} \${medication.name}",
                fontFamily = VazirmatnFontFamily,
                fontSize = 22.sp,
                color = Color(0xFF0F172A)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(text = "زمان مصرف: \${medication.times.firstOrNull() ?: "۰۸:۰۰ صبح"}")
            Spacer(modifier = Modifier.weight(1f))
            Button(
                onClick = { /* Handle taken */ },
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
            ) {
                Text(text = "✅ مصرف کردم (یا سوایپ به راست)", fontSize = 18.sp)
            }
        }
    }
}

@Composable
fun AllDoneCelebrationCard() {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFECFDF5))
    ) {
        Column(
            modifier = Modifier.padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(text = "🎉 عالی بود! همه داروهای امروز رو مصرف کردی!", fontSize = 20.sp)
        }
    }
}`
  },
  {
    id: 'work_manager_worker',
    path: 'app/src/main/java/com/darooto/app/work/MedicationReminderWorker.kt',
    name: 'MedicationReminderWorker.kt (Background Worker)',
    language: 'kotlin',
    category: 'WorkManager',
    description: 'کارگر پس‌زمینه (WorkManager) اندروید برای ایجاد نوتیفیکیشن‌های سر وقت حتی در زمان آفلاین و بسته بودن اپلیکیشن',
    content: `package com.darooto.app.work

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.darooto.app.R
import com.darooto.app.data.local.MedicationDao
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

@HiltWorker
class MedicationReminderWorker @AssistedInject constructor(
    @Assisted private val context: Context,
    @Assisted workerParams: WorkerParameters,
    private val medicationDao: MedicationDao
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        val medId = inputData.getString("MED_ID") ?: return Result.failure()
        val medName = inputData.getString("MED_NAME") ?: "داروی سر وقت"
        val dose = inputData.getString("MED_DOSE") ?: "۱ نوبت"

        showNotification(medName, "زمان مصرف داروتو رسیده ⏰: \$dose را میل کنید.")
        return Result.success()
    }

    private fun showNotification(title: String, message: String) {
        val channelId = "darooto_reminders"
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION.SDK_INT) {
            val channel = NotificationChannel(
                channelId,
                "یادآورهای داروتو",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "نوتیفیکیشن‌های یادآوری مصرف سر وقت دارو"
            }
            notificationManager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification_pill)
            .setContentTitle("💊 \$title")
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}`
  },
  {
    id: 'github_actions_ci',
    path: '.github/workflows/android-build.yml',
    name: 'android-build.yml (GitHub Actions CI/CD)',
    language: 'yaml',
    category: 'Gradle & CI/CD',
    description: 'اکشن خودکار گیت‌هاب جهت بیلد APK و AAB قابل انتشار در گوگل پلی و مارکت‌های ایرانی بدون دخالت دستی',
    content: `name: 🚀 Darooto Android CI/CD Build

on:
  push:
    branches: [ "main", "release/**" ]
  pull_request:
    branches: [ "main" ]

jobs:
  build_android:
    name: 📦 Build APK & AAB (Release Ready)
    runs-on: ubuntu-latest

    steps:
    - name: 📥 Checkout Repository
      uses: actions/checkout@v4

    - name: ☕ Set up JDK 17
      uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'
        cache: gradle

    - name: 🔑 Grant execute permission for gradlew
      run: chmod +x ./gradlew

    - name: 🧪 Run Unit & Room Database Tests
      run: ./gradlew testDebugUnitTest

    - name: 🏗️ Build Release APK
      run: ./gradlew assembleRelease

    - name: 📦 Build Release Android App Bundle (AAB for Google Play & CafeBazaar)
      run: ./gradlew bundleRelease

    - name: 📤 Upload APK Artifact
      uses: actions/upload-artifact@v4
      with:
        name: darooto-release-apk
        path: app/build/outputs/apk/release/*.apk

    - name: 📤 Upload AAB Artifact
      uses: actions/upload-artifact@v4
      with:
        name: darooto-release-aab
        path: app/build/outputs/bundle/release/*.aab`
  }
];
