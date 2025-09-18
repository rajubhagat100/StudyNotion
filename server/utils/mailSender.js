const nodemailer = require("nodemailer");

const mailSender = async (email, title, body, attachments = []) => {
    try {
        let transporter = nodemailer.createTransport({
            host: process.env.MAIL_HOST,
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
            },
        });

        let info = await transporter.sendMail({
            from: 'StudyNotion || CodeHelp - by Babbar',
            to: `${email}`,
            subject: `${title}`,
            html: `${body}`,
            attachments, // ⬅️ support attachments
        });

        console.log("Mail sent:", info.messageId);
        return info;
    } catch (error) {
        console.log("MailSender Error:", error.message);
    }
};

module.exports = mailSender;
