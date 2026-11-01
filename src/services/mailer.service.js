import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

class MailerService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initTransporter();
  }

  initTransporter() {
    if (env.SMTP_USER && env.SMTP_PASS) {
      try {
        const isGmail =
          (env.SMTP_HOST && env.SMTP_HOST.includes('gmail')) ||
          (env.SMTP_USER && env.SMTP_USER.includes('@gmail.com'));

        if (isGmail) {
          this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            },
          });
          logger.info(`Gmail SMTP Mailer initialized successfully for ${env.SMTP_USER}`);
        } else {
          this.transporter = nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            auth: {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            },
          });
          logger.info(`Standard SMTP Mailer initialized for ${env.SMTP_HOST}:${env.SMTP_PORT} (${env.SMTP_USER})`);
        }
        this.isConfigured = true;
      } catch (err) {
        logger.warn(`Failed to initialize SMTP transporter: ${err.message}`);
        this.isConfigured = false;
      }
    } else {
      logger.info('SMTP credentials (SMTP_USER/SMTP_PASS) not set. OTP codes will be printed to server logs for development testing.');
      this.isConfigured = false;
    }
  }

  /**
   * Sends an OTP verification email to the user
   */
  async sendOtpEmail({ toEmail, otp, recipientName = 'Enterprise Partner', purpose = 'Account Registration' }) {
    const fromAddress = env.SMTP_FROM || `AgentMart Enterprise <${env.SMTP_USER || 'no-reply@agentmart.in'}>`;
    const subject = `[AgentMart] Your Verification Passcode: ${otp} (${purpose})`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AgentMart OTP Verification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #faf7ee; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #172554;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #faf7ee; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color: #fffdf9; border: 1px solid #1e3a8a33; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(23, 37, 84, 0.08);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #172554; padding: 28px 36px; text-align: left;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size: 22px; font-weight: 800; color: #faf7ee; letter-spacing: -0.5px;">
                      AgentMart
                    </div>
                    <div style="font-size: 11px; font-family: monospace; color: #93c5fd; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px;">
                      Autonomous B2B Commerce Protocol
                    </div>
                  </td>
                  <td align="right">
                    <span style="background-color: #1e3a8a; border: 1px solid #3b82f6; border-radius: 6px; padding: 4px 10px; font-size: 10px; font-family: monospace; font-weight: bold; color: #faf7ee;">
                      ZERO-TRUST RBAC
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 36px;">
              <h2 style="font-size: 18px; font-weight: 700; color: #172554; margin: 0 0 12px 0;">
                One-Time Security Passcode (OTP)
              </h2>
              <p style="font-size: 13px; color: #1e3a8a; line-height: 1.6; margin: 0 0 24px 0;">
                Hello <strong>${recipientName}</strong>,<br/>
                We received a request to verify your business email address for <strong>${purpose}</strong> on the AgentMart Enterprise Portal.
              </p>

              <!-- OTP Code Display Card -->
              <div style="background-color: #faf7ee; border: 2px dashed #1d4ed8; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #1e3a8a; margin-bottom: 8px;">
                  Your Verification Code
                </div>
                <div style="font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #172554; font-family: monospace; padding-left: 10px;">
                  ${otp}
                </div>
                <div style="font-size: 11px; color: #1d4ed8; font-weight: 600; margin-top: 10px;">
                  Expires in 10 minutes • Valid for single session
                </div>
              </div>

              <p style="font-size: 12px; color: #1e3a8a; line-height: 1.5; margin: 0 0 20px 0;">
                Please enter this 6-digit code on the registration verification screen to complete your organization setup and initialize your autonomous negotiation agent.
              </p>

              <div style="border-top: 1px solid #1e3a8a22; padding-top: 16px; font-size: 11px; color: #64748b; line-height: 1.5;">
                <strong>Security Notice:</strong> AgentMart security personnel will never ask for your verification code. If you did not initiate this registration request, please disregard this email.
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f4efe3; padding: 18px 36px; text-align: center; border-top: 1px solid #1e3a8a22; font-size: 11px; color: #1e3a8a;">
              AgentMart Enterprise Multi-Agent Commerce • Deterministic Zero-Trust Protocol<br/>
              Mumbai & Bengaluru • Contact: security@agentmart.in
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const textContent = `
AgentMart Enterprise Verification
=================================
Hello ${recipientName},

Your one-time security passcode (OTP) for ${purpose} is:

    ${otp}

This passcode expires in 10 minutes.
Enter this code in your registration form to complete your organization setup.

If you did not initiate this request, you can safely ignore this email.
AgentMart Multi-Agent Protocol
`;

    // Console logging so local testing works even without live SMTP credentials
    console.log(`\n======================================================`);
    console.log(`📧 [AGENTMART EMAIL - ${purpose}]`);
    console.log(`To: ${toEmail} (${recipientName})`);
    console.log(`Passcode (OTP): [ ${otp} ]`);
    console.log(`Valid for 10 minutes`);
    console.log(`======================================================\n`);

    if (this.isConfigured && this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: fromAddress,
          to: toEmail,
          subject,
          text: textContent,
          html: htmlContent,
        });
        logger.info(`Verification OTP email successfully sent to ${toEmail} via SMTP (MessageId: ${info.messageId})`);
        return { success: true, simulated: false, messageId: info.messageId };
      } catch (sendErr) {
        logger.error(`Failed to send email via SMTP to ${toEmail}: ${sendErr.message}`);
        // Even if SMTP fails (e.g. network/credentials), we return simulated: true with success so local testing doesn't break
        return { success: true, simulated: true, error: sendErr.message };
      }
    }

    return { success: true, simulated: true };
  }
}

export const mailerService = new MailerService();

