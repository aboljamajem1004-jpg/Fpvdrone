# البنية التحتية — سيرفر التطوير على Google Cloud

## الفكرة

اللعبة **لا تحتاج سيرفر للتشغيل** — هي static site وتُستضاف مجاناً على GitHub Pages
(الـ workflow جاهز في `.github/workflows/deploy.yml`).

رصيدك المجاني (100$) يُصرف فقط على **سيرفر تطوير**: جهاز Ubuntu في السحابة
تتصل به عبر RDP من أي جهاز (ويندوز/ماك/موبايل) وعليه Node وGit والمشروع جاهز.

## الإنشاء (مرة واحدة)

```bash
# بعد تسجيل الدخول: gcloud auth login
PROJECT_ID=your-project-id ./infra/gcp-dev-server.sh
```

السكربت يطبع في النهاية: عنوان الـ IP واسم المستخدم وكلمة سر RDP.

## الاتصال

- **من ويندوز:** افتح تطبيق Remote Desktop Connection وأدخل `IP:3389`
- **من ماك/موبايل:** تطبيق Microsoft Remote Desktop (مجاني)
- **من الطرفية فقط (بدون واجهة):** `gcloud compute ssh skyrush-dev --zone=me-central1-a`

## التطوير على السيرفر

```bash
cd ~/Fpvdrone
npm run dev -- --host      # ثم افتح http://VM_IP:5173 من أي جهاز — حتى تلفونك
```

## التحكم بالتكلفة (مهم!)

- `e2-medium` يكلف ≈ **27$/شهر** لو ظل شغالاً 24/7 → أوقفه عند عدم الاستخدام:

```bash
gcloud compute instances stop  skyrush-dev --zone=me-central1-a   # يوقف الفوترة
gcloud compute instances start skyrush-dev --zone=me-central1-a   # عند العودة
```

- وأنت موقفه تدفع فقط ثمن القرص (≈ 2.5$/شهر لـ 50GB).
- بهذا النمط (بضع ساعات يومياً) رصيد 100$ يكفي **6-12 شهراً**.

## ملاحظات أمان

- غيّر كلمة سر RDP بعد أول دخول: `passwd`
- منفذ RDP مفتوح للعالم افتراضياً. لتقييده على IP منزلك:

```bash
gcloud compute firewall-rules update allow-rdp --source-ranges=YOUR_HOME_IP/32
```
