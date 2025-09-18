const PDFDocument = require("pdfkit");

function generateInvoicePDF(name, amount, orderId, paymentId) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      let buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Title
      doc.fontSize(22).text("Invoice", { align: "center" }).moveDown(2);

      // Invoice details
      doc.fontSize(14).text(`Name: ${name}`);
      doc.text(`Amount Paid: ₹${amount}`);
      doc.text(`Order ID: ${orderId}`);
      doc.text(`Payment ID: ${paymentId}`);
      doc.text(`Date: ${new Date().toLocaleString()}`);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateInvoicePDF;
