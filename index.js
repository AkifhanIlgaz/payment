import cors from "cors";
import express from "express";
import Iyzipay from "iyzipay";
import { loadEnvFile } from "node:process";

import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { PDFDocument, rgb } from "pdf-lib";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnvFile("./.env");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const corsOptions = {
  origin: "https://sahintepesi.com.tr", // Sadece frontend domainine izin ver
  methods: ["GET", "POST"], // İzin verilen HTTP metodları
};
app.use(cors(corsOptions));

const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  uri: process.env.IYZICO_BASE_URL,
});

// 1️⃣ Bağış isteği oluştur
app.post("/api/donation", async (req, res) => {
  let { name, surname, amount } = req.body;
  name = name === "" ? "Hayır" : name;
  surname = surname === "" ? "Sahibi" : surname;

  const request = {
    locale: Iyzipay.LOCALE.TR,
    conversationId: "donation_" + Date.now(),
    price: amount,
    paidPrice: amount,
    currency: Iyzipay.CURRENCY.TRY,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl: `https://api.sahintepesi.com.tr/api/payment/callback?fullName=${name} ${surname}`,
    buyer: {
      id: "BY789",
      name: name,
      surname: surname,
      gsmNumber: "+905350000000",
      email: "hayir@sahibi.com",
      identityNumber: "11111111111",
      registrationAddress: "Bağışçının adresi",
      city: "Istanbul",
      country: "Turkey",
      zipCode: "34732",
    },
    basketItems: [
      {
        id: "donation",
        name: "Dernek Bağışı",
        category1: "Donation",
        itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
        price: amount,
      },
    ],
    billingAddress: {
      address: "Sur Mah. 790. Sok. No: 9 Cizre/Şırnak",
      contactName: "Hayır Sahibi",
      city: "Şırnak",
      country: "Turkey",
    },
  };

  iyzipay.checkoutFormInitialize.create(request, (err, result) => {
    if (err) return res.status(500).json(err);

    console.log(result);
    // iyzico'dan dönen HTML formu frontend'e gönder
    res.json({ paymentPageUrl: result.paymentPageUrl });
  });
});

// 2️⃣ Ödeme sonucu callback
app.post("/api/payment/callback", (req, res) => {
  const token = req.body.token;
  const { fullName } = req.query; // Callback URL'den gelen parametre

  iyzipay.checkoutForm.retrieve({ token }, async (err, result) => {
    if (!err && result.paymentStatus === "SUCCESS") {
      console.log("Bağış başarılı:", result);

      try {
        await createPDF({
          donorName: fullName || result.buyer.name + " " + result.buyer.surname,
          amount: result.paidPrice,
          receiptId: result.paymentId,
          date: new Date().toLocaleDateString("tr-TR"),
        });
        console.log("Makbuz oluşturuldu.");
      } catch (error) {
        console.error("Makbuz oluşturma hatası:", error);
      }

      // Veritabanına kaydet
      return res.redirect(
        `https://sahintepesi.com.tr/donation-success?receiptId=${result.paymentId}`,
      );
    }
    res.status(200).send("OK");
  });
});

// 3️⃣ Makbuz indirme endpoint'i
app.get("/api/receipts/:receiptId", (req, res) => {
  const { receiptId } = req.params;

  // Güvenlik: Sadece alfanumerik karakterler ve tire kabul et
  if (!/^[a-zA-Z0-9_-]+$/.test(receiptId)) {
    return res.status(400).json({ error: "Geçersiz makbuz ID" });
  }

  const filePath = path.join(__dirname, "receipts", `${receiptId}.pdf`);

  // Dosya var mı kontrol et
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Makbuz bulunamadı" });
  }

  // PDF dosyasını gönder
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="makbuz_${receiptId}.pdf"`,
  );
  res.sendFile(filePath);
});

// 4️⃣ Mevcut makbuzları listeleme (opsiyonel - admin için)
app.get("/api/receipts", (req, res) => {
  const receiptsDir = path.join(__dirname, "receipts");

  if (!fs.existsSync(receiptsDir)) {
    return res.json({ receipts: [] });
  }

  const files = fs
    .readdirSync(receiptsDir)
    .filter((file) => file.endsWith(".pdf"))
    .map((file) => ({
      receiptId: file.replace("receipt_", "").replace(".pdf", ""),
      filename: file,
      created: fs.statSync(path.join(receiptsDir, file)).birthtime,
    }));

  res.json({ receipts: files });
});

app.listen(8080, () => console.log("Server running on http://localhost:3000"));

const dernekName = "Cizre Şahintepesi Dernek";
const address = "Sur Mah. 790. Sok No: 9 Cizre/Şırnak";

async function createPDF({ donorName, amount, receiptId, date }) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const page = pdfDoc.addPage([600, 400]);

  const fontPath = path.join(__dirname, "opensans.ttf");
  const fontBytes = fs.readFileSync(fontPath);
  const customFont = await pdfDoc.embedFont(fontBytes);

  page.drawText("Bağış Makbuzu", {
    x: 200,
    y: 350,
    size: 24,
    color: rgb(0, 0, 0),
    font: customFont,
  });

  page.drawText(`Makbuz No: ${receiptId}`, {
    x: 50,
    y: 310,
    size: 14,
    font: customFont,
  });
  page.drawText(`Bağış Yapan: ${donorName}`, {
    x: 50,
    y: 280,
    size: 14,
    font: customFont,
  });
  page.drawText(`Bağış Miktarı: ${amount} TL`, {
    x: 50,
    y: 250,
    size: 14,
    font: customFont,
  });
  page.drawText(`Tarih: ${date}`, {
    x: 50,
    y: 220,
    size: 14,
    font: customFont,
  });
  page.drawText(`Dernek İsmi: ${dernekName}`, {
    x: 50,
    y: 190,
    size: 14,
    font: customFont,
  });
  page.drawText(`Dernek Adresi: ${address}`, {
    x: 50,
    y: 160,
    size: 14,
    font: customFont,
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(`./receipts/${receiptId}.pdf`, pdfBytes);
}
