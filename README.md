# ⭐ Kuiz SDZ

Permainan kuiz masa nyata gaya "kuiz kelas" untuk murid: **guru (admin)** memaparkan soalan di skrin besar, **murid** menjawab menggunakan telefon/tablet sendiri.

Soalan diambil daripada *Kuiz Slot 2*:
- **MISI 2 • Smart Digital Citizen**: 12 soalan (Kad Situasi A–F + Kuiz 1–6, dengan penerangan jawapan)
- **MISI 3 • Digital Game Challenge**: 20 soalan

## Cara main

1. Buka laman GitHub Pages.
2. **Guru:** tekan butang **🧑‍🏫 Admin** di atas sebelah kanan → pilih set soalan & masa → **Cipta Bilik**.
   Skrin akan memaparkan **kod 6 digit** dan kod QR.
3. **Murid:** buka laman yang sama (atau imbas QR) → masukkan kod → pilih watak & nama → tunggu.
4. Guru tekan **Mula ▶**. Setiap soalan: kiraan "Bersedia" → jawab → jawapan didedahkan + penerangan → papan markah.
5. Di penghujung, podium 3 terbaik + konfeti. Guru boleh **muat turun keputusan (CSV)** atau **Main lagi** dalam bilik yang sama.

Markah: 500–1000 mata untuk jawapan betul (lebih laju = lebih tinggi) + bonus 🔥 jawapan betul berturut-turut.

Pintasan guru: **Space/Enter** untuk butang seterusnya. Klik nama pemain di lobi untuk mengeluarkannya.

## Hidupkan GitHub Pages

Repo → **Settings → Pages** → *Source: Deploy from a branch* → pilih branch (cth. `main`) dan folder `/ (root)` → **Save**.
Laman akan tersedia di `https://<nama-pengguna>.github.io/<nama-repo>/`.

## Nota teknikal

- 100% fail statik (HTML/CSS/JS), tiada pelayan atau akaun diperlukan.
- Sambungan masa nyata menggunakan [PeerJS](https://peerjs.com/) (WebRTC) melalui pelayan perantara awam percuma PeerJS. Peranti guru menjadi "hos"; **jangan tutup / muat semula tab guru** semasa permainan.
- Murid yang termuat semula halaman atau terputus akan disambung semula secara automatik dengan markah dikekalkan.
- Bunyi disintesis dengan Web Audio (tiada fail audio). Butang 🔊 untuk senyap.
- Untuk tukar/tambah soalan, sunting `js/questions.js` (`a` = indeks jawapan betul: 0=A, 1=B, 2=C).
- Pilihan lanjutan: `?peer=hos:port` untuk guna pelayan PeerJS sendiri (jika rangkaian sekolah menyekat pelayan awam).
