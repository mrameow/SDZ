# ⭐ Kuiz SDZ

Permainan kuiz masa nyata gaya "kuiz kelas" untuk murid: **guru (admin)** memaparkan soalan di skrin besar, **murid** menjawab menggunakan telefon/tablet sendiri.

Soalan diambil daripada *Kuiz Slot 2*. **Semua soalan hanya ada 2 pilihan: A atau B.**
- **MISI 2 • Smart Digital Citizen**: 12 soalan (Kad Situasi A–F + Kuiz 1–6, dengan penerangan jawapan)
- **MISI 3 • Digital Game Challenge**: 20 soalan
- **Teknologi Ceria • Tahun 1 & 2**: 30 soalan bergambar aras rendah (kenali peranti, ikon & skrin, guna teknologi dengan selamat)
- **Kenali Teknologi • Mudah**: 21 soalan bergambar paling mudah

> Soalan asal yang ada 3 pilihan (A/B/C) telah diringkaskan kepada jawapan betul + satu pilihan salah.
> Kedudukan A/B juga boleh ditukar secara rawak setiap permainan, jadi huruf jawapan mungkin berbeza daripada skema jawapan dalam dokumen asal.

Ada dua cara menjawab (pilih di skrin tetapan admin):

| | 📄 **Kad kertas** (lalai) | 📷 **Q-Card** | 📱 **Peranti** |
|---|---|---|---|
| Murid perlukan | Kad A dan B (`kad.html`) | Q-Card bernombor (`qcard.html`) | Telefon / tablet |
| Cara jawab | Angkat kad | Tunjuk sisi A atau B (kad lipat) / huruf jawapan di atas (kad pusing) | Tekan jawapan pada peranti |
| Markah | Guru tandakan kumpulan yang betul (pilihan) | Automatik: kamera guru imbas kad | Automatik ikut kelajuan |

## Cara main: Mod Kad Kertas 📄

1. Cetak kad: **Admin → 🖨️ Cetak kad A / B** (atau buka `kad.html`). Beri setiap murid/kumpulan satu kad A dan satu kad B.
2. Buka laman → **🧑‍🏫 Admin** → kata laluan **0000** → pilih **📄 Kad kertas**.
3. Masukkan nama kumpulan untuk papan markah, atau **buang semua kumpulan** jika mahu main tanpa markah.
4. **Teruskan → Mula ▶**. Setiap soalan:
   - Soalan dipapar dengan pemasa; murid fikir dan sediakan kad.
   - Masa tamat → skrin papar **"✋ Angkat kad sekarang!"**. Murid angkat kad A atau B.
   - Guru tekan **Dedah jawapan 👀**, kemudian tandakan kumpulan yang betul (ada butang **✔ Semua betul**).
   - Papan markah (100 mata setiap jawapan betul) → soalan seterusnya.
5. Di akhir, podium 3 kumpulan terbaik (atau skrin "Tamat!" jika tiada kumpulan).

## Cara main: Mod Q-Card 📷

Seperti Plickers / Q-card Quizizz: setiap murid ada kad bercetak sendiri, dan kamera guru membaca jawapan semua murid serentak.

1. **Admin → 📷 Q-Card**. Taip senarai nama murid (satu nama setiap baris, maksimum 60). Baris 1 = kad nombor 1, baris 2 = kad nombor 2, dan seterusnya. Butang **🔢 Guna nombor sahaja** mengisi Murid 1–30.
2. **🖨️ Cetak Q-Card**: setiap kad ada nombor & nama murid. Cetak semula jika senarai nama diubah. Dua jenis kad:
   - **📄 Lipat (disyorkan untuk Tahun 1–2)**: satu murid sehelai A4 melintang. Kiri = **A** (bingkai biru), kanan = **B** (bingkai merah, kod dicetak terbalik). Lipat dua di garisan tengah; murid tunjuk sisi jawapan sambil pegang kad tegak.
   - **🔄 Pusing**: 2 atau 4 kad sehelai; murid pusing kad supaya huruf jawapan di atas.
   - Kedua-dua jenis guna kod yang sama, jadi boleh dicampur. Jika kertas belum dilipat (kedua-dua sisi kelihatan), kad itu tidak dikira.
3. **Teruskan → Mula ▶**. Setiap soalan:
   - Masa tamat → **"✋ Angkat kad sekarang!"** → guru tekan **📷 Imbas kad**.
   - Murid pegang kad dengan huruf jawapan (**A** atau **B**) di **atas**.
   - Halakan kamera ke kelas. Kotak hijau = kad sudah dibaca; senarai di tepi menunjukkan siapa sudah diimbas.
   - Tekan **Dedah jawapan 👀**. Jawapan betul dapat 100 mata.
4. Kamera perlukan **https** (GitHub Pages sudah https) dan kebenaran kamera. Butang 🔄 menukar kamera (depan/belakang).

### 📱 Guna telefon sebagai kamera

Lebih mudah bergerak di dalam kelas berbanding laptop:
1. Di skrin guru (lobi Q-Card atau skrin imbasan), tekan **📱 Guna kamera telefon**. Kod QR dan kod 6 digit dipaparkan.
2. Imbas kod QR dengan telefon → masukkan kata laluan admin → benarkan kamera.
   (Atau di telefon: buka laman → **Admin** → **📱 Jadikan telefon ini kamera Q-Card** → masukkan kod.)
3. Telefon mengimbas kad dan menghantar jawapan ke skrin guru secara terus. Kamera laptop tidak digunakan selagi telefon disambung (butang **💻 Guna kamera komputer** jika perlu).
4. Telefon juga jadi **alat kawalan jauh**: butang besar di bawah mengikut langkah semasa (Mula, Tamatkan, Imbas kad, Dedah jawapan, Seterusnya).

Perlukan internet pada kedua-dua peranti (untuk sambungan telefon ↔ laptop).

**Sambungan yang tahan lasak:** telefon (dan peranti murid dalam mod peranti) mula-mula cuba sambungan terus.
Jika gagal dalam beberapa saat (contoh: telefon guna data mudah alih, atau WiFi sekolah yang mengasingkan
peranti), sambungan beralih secara automatik **melalui pelayan PeerJS**. Status telefon akan menunjukkan
"Disambung ke skrin guru (melalui pelayan)". Kod kamera telefon kekal sama selepas laman guru dimuat semula,
jadi telefon menyambung semula sendiri.

Tip: guna kertas putih, cahaya yang cukup, dan kad saiz "2 kad sehelai" untuk kelas besar. Kad yang dipegang mengiring tidak dikira.

## Cara main: Mod Peranti 📱

## Cara main

1. Buka laman GitHub Pages.
2. **Guru:** tekan butang **🧑‍🏫 Admin** di atas sebelah kanan → masukkan kata laluan **0000** → pilih **📱 Peranti**, set soalan, masa & **soalan mula** → **Cipta Bilik**.
   Skrin akan memaparkan **kod 6 digit** dan kod QR.
3. **Murid:** buka laman yang sama (atau imbas QR) → masukkan kod → pilih watak & nama → tunggu.
4. Guru tekan **Mula ▶**. Setiap soalan: kiraan "Bersedia" → jawab → jawapan didedahkan + penerangan → papan markah.
5. Di penghujung, podium 3 terbaik + konfeti. Guru boleh **muat turun keputusan (CSV)** atau **Main lagi** dalam bilik yang sama.

Markah mod peranti: 500–1000 mata untuk jawapan betul (lebih laju = lebih tinggi) + bonus 🔥 jawapan betul berturut-turut.

### Tab guru tertutup?

Kemajuan disimpan secara automatik dalam pelayar guru (kedua-dua mod). Buka semula laman → **Admin** → kad kuning **"Permainan belum selesai"** → **Sambung semula**.
Dalam mod peranti, sistem cuba guna **kod yang sama**, jadi telefon murid akan menyambung semula sendiri (markah dikekalkan). Jika kod berubah, murid masukkan kod baharu dengan **nama yang sama** dan markah lama mereka akan dipulihkan.
Guru juga boleh mulakan permainan baharu dari mana-mana soalan melalui pilihan **🎯 Mula dari soalan**.

### Hentikan permainan

Semasa permainan, butang **⏹ Hentikan** di atas sebelah kanan membolehkan guru berhenti serta-merta: **🏆 Tamat & tunjuk keputusan** (podium dengan markah setakat ini) atau **🏠 Kembali ke menu**.

## Soalan sendiri ✏️

- **Admin → ✏️ Buat soalan sendiri**: tajuk, ikon, soalan dan gambar emoji (pilihan, cth: 💻 atau 🤖➡️⭐). Setiap soalan mesti ada **dua jawapan (A dan B)**; tekan **✔ Betul** pada jawapan yang betul. Penerangan jawapan adalah pilihan.
- Set MISI 2 / MISI 3 boleh **📋 Salin** untuk diubah suai. Set sendiri ada butang **✏️ Sunting**.
- Soalan disimpan dalam **pelayar ini sahaja**. Guna **⬇ Eksport** untuk simpan fail `.json`, dan **📥 Import fail soalan** untuk memasukkannya di komputer lain atau berkongsi dengan guru lain.

Pintasan guru: **Space/Enter** untuk butang seterusnya (termasuk "Dedah jawapan"). Klik nama pemain di lobi untuk mengeluarkannya.

## Hidupkan GitHub Pages

Repo → **Settings → Pages** → *Source: Deploy from a branch* → pilih branch (cth. `main`) dan folder `/ (root)` → **Save**.
Laman akan tersedia di `https://<nama-pengguna>.github.io/<nama-repo>/`.

## Nota teknikal

- Mod kad kertas dan Q-Card tidak memerlukan internet selepas laman dibuka.
- Pengesanan Q-Card menggunakan [js-aruco](https://github.com/jcmellado/js-aruco) (MIT) dalam pelayar; tiada gambar dihantar ke mana-mana.
- 100% fail statik (HTML/CSS/JS), tiada pelayan atau akaun diperlukan.
- Sambungan masa nyata menggunakan [PeerJS](https://peerjs.com/) (WebRTC) melalui pelayan perantara awam percuma PeerJS. Peranti guru menjadi "hos"; jika tab guru tertutup, gunakan **Sambung semula** (lihat di atas).
- Murid yang termuat semula halaman atau terputus akan disambung semula secara automatik dengan markah dikekalkan.
- Bunyi disintesis dengan Web Audio (tiada fail audio). Butang 🔊 untuk senyap.
- Kata laluan admin ditetapkan dalam `js/app.js` (`ADMIN_PASS`). Ia hanya menghalang murid daripada menekan butang admin; ia boleh dilihat dalam kod sumber.
- Untuk tukar/tambah soalan, sunting `js/questions.js` (`o` = dua pilihan, `a` = indeks jawapan betul: 0=A, 1=B).
- Pilihan lanjutan: `?peer=hos:port` untuk guna pelayan PeerJS sendiri (jika rangkaian sekolah menyekat pelayan awam).
