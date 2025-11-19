import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Iyzipay from "iyzipay";
import { loadEnvFile } from "node:process";

loadEnvFile("./.env");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());

const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  uri: process.env.IYZICO_BASE_URL,
});

// 1️⃣ Bağış isteği oluştur
app.post("/api/donation", async (req, res) => {
  const { fullName, email, amount } = req.body;
  console.log({ fullName, email, amount });
  const request = {
    locale: Iyzipay.LOCALE.TR,
    conversationId: "donation_" + Date.now(),
    price: amount,
    paidPrice: amount,
    currency: Iyzipay.CURRENCY.TRY,
    basketId: "B67832",
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl:
      "https://hyaenic-maryellen-unstringent.ngrok-free.dev/api/payment/callback",
    buyer: {
      id: "BY789",
      name: fullName,
      surname: "Donor",
      gsmNumber: "+905350000000",
      email: email,
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
      address:
        "Altunizade Mah. İnci Çıkmazı Sokak No: 3 İç Kapı No: 10 Üsküdar İstanbul",
      zipCode: "34742",
      contactName: "Jane Doe",
      city: "Istanbul",
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
  console.log(req.method);
  console.log(req.query);

  const token = req.body.token;

  iyzipay.checkoutForm.retrieve({ token }, (err, result) => {
    if (result.paymentStatus === "SUCCESS") {
      console.log("Bağış başarılı:", result);
      // Veritabanına kaydet
    }
    res.status(200).send("OK");
  });
});

app.listen(8080, () => console.log("Server running on http://localhost:3000"));
