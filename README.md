# ⭐ Kuiz SDZ

Permainan kuiz masa nyata gaya "kuiz kelas" untuk murid: **guru (admin)** memaparkan soalan di skrin besar, **murid** menjawab menggunakan telefon/tablet sendiri.

Soalan diambil daripada *Kuiz Slot 2*. **Semua soalan hanya ada 2 pilihan: A atau B.**
- **MISI 2 • Smart Digital Citizen**: 12 soalan (Kad Situasi A–F + Kuiz 1–6, dengan penerangan jawapan)
- **MISI 3 • Digital Game Challenge**: 20 soalan

> Soalan asal yang ada 3 pilihan (A/B/C) telah diringkaskan kepada jawapan betul + satu pilihan salah.
> Kedudukan A/B juga boleh ditukar secara rawak setiap permainan, jadi huruf jawapan mungkin berbeza daripada skema jawapan dalam dokumen asal.

Ada dua cara menjawab (pilih di skrin tetapan admin):

| | 📄 **Kad kertas** (lalai) | 📱 **Peranti** |
|---|---|---|
| Murid perlukan | Kad A dan B (cetak dari `kad.html`) | Telefon / tablet |
| Cara jawab | Angkat kad bila guru kata "Angkat!" | Tekan jawapan pada peranti |
| Markah | Guru tandakan kumpulan yang betul (pilihan) | Automatik ikut kelajuan |

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

Pintasan guru: **Space/Enter** untuk butang seterusnya (termasuk "Dedah jawapan"). Klik nama pemain di lobi untuk mengeluarkannya.

## Hidupkan GitHub Pages

Repo → **Settings → Pages** → *Source: Deploy from a branch* → pilih branch (cth. `main`) dan folder `/ (root)` → **Save**.
Laman akan tersedia di `https://<nama-pengguna>.github.io/<nama-repo>/`.

## Nota teknikal

- Mod kad kertas tidak memerlukan internet selepas laman dibuka.
- 100% fail statik (HTML/CSS/JS), tiada pelayan atau akaun diperlukan.
- Sambungan masa nyata menggunakan [PeerJS](https://peerjs.com/) (WebRTC) melalui pelayan perantara awam percuma PeerJS. Peranti guru menjadi "hos"; jika tab guru tertutup, gunakan **Sambung semula** (lihat di atas).
- Murid yang termuat semula halaman atau terputus akan disambung semula secara automatik dengan markah dikekalkan.
- Bunyi disintesis dengan Web Audio (tiada fail audio). Butang 🔊 untuk senyap.
- Kata laluan admin ditetapkan dalam `js/app.js` (`ADMIN_PASS`). Ia hanya menghalang murid daripada menekan butang admin; ia boleh dilihat dalam kod sumber.
- Untuk tukar/tambah soalan, sunting `js/questions.js` (`o` = dua pilihan, `a` = indeks jawapan betul: 0=A, 1=B).
- Pilihan lanjutan: `?peer=hos:port` untuk guna pelayan PeerJS sendiri (jika rangkaian sekolah menyekat pelayan awam).
