import React, { useState } from 'react';
import { ANDROID_PROJECT_FILES } from '../../data/initialData';
import { AndroidProjectFile } from '../../types';
import { toPersianNumbers } from '../../utils/persian';
import JSZip from 'jszip';
import { Package, Download, Check, Copy, Code2, Terminal, ShieldCheck, GitBranch, Sparkles, Smartphone, Layers, Database, Cpu } from 'lucide-react';

export const AndroidExportView: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<AndroidProjectFile>(ANDROID_PROJECT_FILES[0]);
  const [copied, setCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipDownloaded, setZipDownloaded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();

      // Create root folder
      const rootFolder = zip.folder("Darooto-Android-Studio-CleanArch");

      if (rootFolder) {
        // Add project metadata and readmes
        rootFolder.file("README.md", `# 💊 پروژه اندروید استودیو داروتو (Darooto Android App)
اپلیکیشن حرفه‌ای مدیریت دارو با رابط کاربری راست به چپ (RTL)، معماری Clean Architecture + MVVM + Jetpack Compose، دیتابیس Room و WorkManager.

## نحوه بیلد و اجرا در Android Studio:
1. پروژه را در Android Studio (نسخه Ladybug یا جدیدتر ۲۰۲۶) باز کنید.
2. منتظر بمانید تا Gradle Sync انجام شود.
3. دکمه Run را بزنید یا با دستوران زیر فایل خروجی APK و AAB قابل انتشار در گوگل پلی و بازار را بگیرید:

\`\`\`bash
./gradlew assembleRelease
./gradlew bundleRelease
\`\`\`

## انتشار خودکار با GitHub Actions:
این پروژه دارای فایل \`.github/workflows/android-build.yml\` است. با پوش (Push) کردن کد به گیت‌هاب، فایل‌های خروجی APK و AAB به صورت خودکار بیلد و آماده دانلود می‌شوند.
`);

        rootFolder.file("gradle.properties", `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official`);

        // Add all predefined code files
        ANDROID_PROJECT_FILES.forEach(file => {
          rootFolder.file(file.path, file.content);
        });

        // Add a stub AndroidManifest.xml
        rootFolder.file("app/src/main/AndroidManifest.xml", `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.darooto.app">

    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="داروتو"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.Darooto">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="portrait">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Darooto-Android-Studio-Project.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setZipDownloaded(true);
      setTimeout(() => setZipDownloaded(false), 4000);
    } catch (e) {
      console.error("Error creating ZIP:", e);
      alert("خطا در ایجاد فایل ZIP. لطفاً کدها را دستی کپی کنید.");
    } finally {
      setIsZipping(false);
    }
  };

  const categories: { id: string; label: string; icon: any; color: string }[] = [
    { id: 'Clean Architecture', label: 'معماری Clean Architecture', icon: Layers, color: 'text-blue-500' },
    { id: 'UI Compose', label: 'رابط کاربری Jetpack Compose', icon: Smartphone, color: 'text-emerald-500' },
    { id: 'Database Room', label: 'دیتابیس Room (آفلاین)', icon: Database, color: 'text-purple-500' },
    { id: 'WorkManager', label: 'یادآور WorkManager', icon: Cpu, color: 'text-rose-500' },
    { id: 'Gradle & CI/CD', label: 'بیلد گریدل و GitHub Actions', icon: GitBranch, color: 'text-amber-500' }
  ];

  return (
    <div className="w-full max-w-4xl mx-auto py-4 px-3 sm:px-4 pb-24 space-y-6 select-none">
      {/* Top Banner */}
      <div className="bg-gradient-to-tr from-amber-600 via-orange-600 to-rose-700 rounded-[32px] p-6 sm:p-8 text-white shadow-xl shadow-amber-500/20 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-2 text-amber-200 text-xs font-bold mb-3">
          <ShieldCheck className="w-4 h-4" />
          <span>پروژه واقعی قابل بیلد و انتشار در مارکت‌های اندروید (۲۰۲۶)</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
              📦 سورس کد و خروجی پروژه Android Studio کاتلین
            </h2>
            <p className="text-xs sm:text-sm text-amber-100 font-medium max-w-lg leading-relaxed">
              تمام استانداردهای درخواستی شامل زبان Kotlin، رابط کاربری Jetpack Compose، معماری Clean Architecture + MVVM، دیتابیس Room، بک‌گراند ورک WorkManager و اکشن خودکار GitHub Actions (جهت تولید APK و AAB) آماده دانلود است.
            </p>
          </div>

          {/* Download ZIP Button */}
          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="flex items-center justify-center gap-2 bg-white text-slate-900 font-black px-6 py-4 rounded-2xl shadow-2xl hover:bg-amber-50 hover:scale-105 active:scale-95 transition-all shrink-0 text-sm sm:text-base"
          >
            {isZipping ? (
              <span className="animate-pulse">در حال آماده‌سازی ZIP...</span>
            ) : zipDownloaded ? (
              <>
                <Check className="w-5 h-5 text-emerald-600" />
                <span className="text-emerald-700">دانلود شد! (آماده Build)</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5 text-amber-600 animate-bounce" />
                <span>دانلود سورس کامل اندروید (.zip)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* GitHub Actions CI/CD status badge */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
            <GitBranch className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-200">
              بیلد خودکار در GitHub (.github/workflows/android-build.yml)
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              با پوش کردن فایل‌ها در گیت‌هاب، خروجی‌های <code className="text-emerald-400 font-mono">darooto-release.apk</code> و <code className="text-emerald-400 font-mono">darooto-release.aab</code> خودکار در بخش Artifacts تولید می‌شوند.
            </p>
          </div>
        </div>
        <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
          ✓ آماده انتشار در بازار و گوگل پلی
        </span>
      </div>

      {/* FILE EXPLORER AND CODE VIEWER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Files List */}
        <div className="lg:col-span-1 bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl rounded-[32px] p-5 border border-white/50 dark:border-slate-700/50 shadow-xl space-y-4">
          <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
            <Code2 className="w-4 h-4 text-emerald-500" />
            <span>فایل‌های پروژه کاتلین (انتخاب کنید):</span>
          </h3>

          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {ANDROID_PROJECT_FILES.map((file) => {
              const isSelected = selectedFile.id === file.id;

              return (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-right p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-amber-50/80 dark:bg-amber-950/60 border-amber-500 text-amber-900 dark:text-amber-200 font-bold shadow-xs backdrop-blur-sm'
                      : 'bg-white/60 dark:bg-slate-800/60 border-white/60 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-white/90'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-bold truncate text-slate-800 dark:text-white" dir="ltr">
                      {file.name}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {file.category}
                    </div>
                  </div>
                  <span className="text-xs">→</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right column: Code Inspector */}
        <div className="lg:col-span-2 bg-slate-900/90 backdrop-blur-2xl rounded-[32px] p-6 border border-slate-800 shadow-2xl flex flex-col h-[560px] overflow-hidden">
          {/* Code Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4 shrink-0">
            <div>
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 inline-block mb-1" dir="ltr">
                {selectedFile.path}
              </span>
              <p className="text-xs text-slate-400 font-medium">
                {selectedFile.description}
              </p>
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors border border-slate-700 shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">کپی شد!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>کپی کد</span>
                </>
              )}
            </button>
          </div>

          {/* Code Content */}
          <div className="flex-1 overflow-auto bg-slate-950 p-4 rounded-2xl border border-slate-800 font-mono text-xs text-slate-200 leading-relaxed text-left" dir="ltr">
            <pre className="whitespace-pre">
              <code>{selectedFile.content}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
