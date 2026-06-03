# ענפים — פלטפורמת ניהול מאמנים 🌿

אפליקציה מודרנית ויפה לניהול מאמנים, שיעורים, וציוד ספורטיבי.

## 🎨 העיצוב
- **צבעים**: כחול נייבי, אדום, לבן
- **ממשק**: חדשני, קל להשתמש, responsive
- **Animations**: חלקות ודינאמיות
- **Font**: Heebo (עברית native)

## 🚀 העלאה ל-Netlify

### אפשרות 1: Drag & Drop (הדרך הקלה ביותר)
1. היכנס ל [Netlify](https://app.netlify.com)
2. גרור את תיקיית הפרויקט לתוך Netlify
3. המתן לעלייה (כ-30 שניות)
4. הסתיים! 🎉

### אפשרות 2: Git (מומלץ)
```bash
# אתחול Git
git init
git add .
git commit -m "Initial commit"

# העלאה ל-GitHub
# 1. צור repo חדש ב-GitHub
# 2. רץ:
git remote add origin https://github.com/YOUR-USERNAME/anafim.git
git branch -M main
git push -u origin main

# חבר אל Netlify
# 1. היכנס ל-Netlify
# 2. לחץ "New site from Git"
# 3. בחר GitHub + את הrepo שלך
# 4. לחץ Deploy
```

## 🔧 הגדרות Firebase

כדי שהאפליקציה תעבוד, תוצא להגדיר Firebase:

1. היכנס ל [Firebase Console](https://console.firebase.google.com)
2. צור פרויקט חדש: `anafim-platform`
3. הוסף אפליקציה web
4. העתק את ה-config ורשום אותו ב-`js/firebase-config.js`
5. הפעל:
   - ✅ Authentication (Email/Password + Google)
   - ✅ Firestore Database (test mode)
   - ✅ Cloud Storage (test mode)
6. בהגדרות Authentication → Authorized domains → הוסף את הדומיין של Netlify

## 📂 מבנה הקבצים
```
ענפים-פלטפורמה/
├── index.html          # עמוד ההתחברות
├── app.html            # האפליקציה הראשית
├── css/
│   └── style.css       # כל ה-styling (navy, red, white)
├── js/
│   ├── app.js          # לוגיקה הראשית
│   └── firebase-config.js
├── assets/
│   └── logo_b64.txt
├── netlify.toml        # הגדרות Netlify
├── .gitignore          # קבצים שלא להעלות
└── README.md           # קובץ זה
```

## 🌟 תכונות
- ✅ כניסה עם Google ואימייל
- ✅ ניהול מאמנים וקואורדינטורים
- ✅ מערכי שיעור וסיכומים
- ✅ לוח שנה של שיעורים
- ✅ גלריית תמונות
- ✅ מערכת הודעות
- ✅ ניהול ציוד

## 💬 תמיכה
אם יש בעיה:
1. בדוק את ה-Console (F12)
2. וודא שהקבצים עלו ל-Netlify
3. וודא שהFirebase מוגדר כמו שצריך

## 📝 ערכתי לאחרונה
- ✨ עדכון CSS חדשני
- 🎨 צבעים navy, red, white
- ⚡ Animations חדשות
- 📱 Responsive design משופר

---

בנוי בקצב לתרומה ותמיכה 🚀
