"""
Email Service - Handles email notifications using Resend API.

Features:
- Admin notifications for new pharmacist registrations
- Pharmacist notifications for verification status changes
- Consultation booking confirmations
"""
import logging
import httpx
from typing import Optional, List
from config import RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAILS

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


class EmailService:
    """Email notification service using Resend API."""

    @staticmethod
    def is_enabled() -> bool:
        """Check if email service is properly configured."""
        return bool(RESEND_API_KEY)

    @staticmethod
    async def send_email(
        to: List[str],
        subject: str,
        html: str,
        text: Optional[str] = None
    ) -> bool:
        """
        Send an email via Resend API.

        Args:
            to: List of recipient email addresses
            subject: Email subject line
            html: HTML body content
            text: Plain text body (optional)

        Returns:
            True if sent successfully, False otherwise
        """
        if not EmailService.is_enabled():
            logger.warning("Email service not configured, skipping email send")
            return False

        if not to:
            logger.warning("No recipients specified for email")
            return False

        payload = {
            "from": EMAIL_FROM,
            "to": to,
            "subject": subject,
            "html": html,
        }

        if text:
            payload["text"] = text

        try:
            logger.info("Sending email via Resend API to: %s, subject: %s", to, subject)
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    RESEND_API_URL,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {RESEND_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    timeout=10.0
                )

                if response.status_code in (200, 201):
                    logger.info("Email sent successfully to %s (status: %s)", to, response.status_code)
                    return True
                else:
                    logger.error("Failed to send email: HTTP %s - %s", response.status_code, response.text)
                    return False

        except httpx.TimeoutException:
            logger.error("Email send timeout - Resend API did not respond in time")
            return False
        except Exception as e:
            logger.error("Email send error: %s", e, exc_info=True)
            return False

    @staticmethod
    async def notify_admins_new_pharmacist(
        pharmacist_name: str,
        license_number: str,
        email: Optional[str] = None
    ) -> bool:
        """
        Notify admin users about a new pharmacist registration.

        Args:
            pharmacist_name: Name of the registered pharmacist
            license_number: License number submitted
            email: Pharmacist's email (if available)
        """
        logger.info("Attempting to send admin notification for new pharmacist: %s", pharmacist_name)

        if not EmailService.is_enabled():
            logger.warning("Email service disabled (RESEND_API_KEY not configured). Admin notification skipped.")
            return False

        if not ADMIN_EMAILS:
            logger.warning("No admin emails configured (ADMIN_EMAILS env var empty). Admin notification skipped.")
            return False

        logger.info("Sending notification to admins: %s", ADMIN_EMAILS)

        subject = f"[MediRep] New Pharmacist Registration: {pharmacist_name}"

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #0891b2, #0e7490); color: white; padding: 24px; border-radius: 12px 12px 0 0; }}
                .content {{ background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }}
                .badge {{ display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }}
                .info-row {{ margin: 12px 0; padding: 12px; background: white; border-radius: 8px; border: 1px solid #e2e8f0; }}
                .label {{ font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }}
                .value {{ font-size: 16px; font-weight: 500; color: #111827; }}
                .btn {{ display: inline-block; background: #0891b2; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin-top: 16px; }}
                .btn:hover {{ background: #0e7490; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 24px;">New Pharmacist Registration</h1>
                    <p style="margin: 8px 0 0; opacity: 0.9;">A new pharmacist has submitted their profile for verification</p>
                </div>
                <div class="content">
                    <span class="badge">Pending Verification</span>

                    <div class="info-row">
                        <div class="label">Pharmacist Name</div>
                        <div class="value">{pharmacist_name}</div>
                    </div>

                    <div class="info-row">
                        <div class="label">License Number</div>
                        <div class="value">{license_number}</div>
                    </div>

                    {f'<div class="info-row"><div class="label">Email</div><div class="value">{email}</div></div>' if email else ''}

                    <p style="color: #6b7280; margin-top: 20px;">
                        Please review the submitted documents and verify the pharmacist's credentials in the admin dashboard.
                    </p>

                    <a href="{get_admin_url()}/verify" class="btn">
                        Review Application
                    </a>
                </div>
            </div>
        </body>
        </html>
        """

        text = f"""
New Pharmacist Registration

Name: {pharmacist_name}
License: {license_number}
{f'Email: {email}' if email else ''}

Please review the application in the admin dashboard.
        """

        return await EmailService.send_email(ADMIN_EMAILS, subject, html, text)

    @staticmethod
    async def notify_pharmacist_verification(
        email: str,
        name: str,
        status: str,
        notes: Optional[str] = None
    ) -> bool:
        """
        Notify pharmacist about their verification status change.

        Args:
            email: Pharmacist's email address
            name: Pharmacist's name
            status: New verification status ('approved' or 'rejected')
            notes: Optional notes from the admin
        """
        if not email:
            logger.warning("No pharmacist email provided, skipping notification")
            return False

        is_approved = status == "approved"

        subject = f"[MediRep] Your Pharmacist Application has been {'Approved' if is_approved else 'Rejected'}"

        if is_approved:
            html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 24px; border-radius: 12px 12px 0 0; text-align: center; }}
                    .content {{ background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }}
                    .success-icon {{ font-size: 48px; margin-bottom: 12px; }}
                    .btn {{ display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="success-icon">&#10003;</div>
                        <h1 style="margin: 0;">Congratulations, {name}!</h1>
                        <p style="margin: 8px 0 0; opacity: 0.9;">Your pharmacist application has been approved</p>
                    </div>
                    <div class="content">
                        <p>Great news! Your pharmacist profile has been verified and you can now:</p>
                        <ul>
                            <li>Set your availability schedule</li>
                            <li>Appear in patient searches</li>
                            <li>Accept consultation bookings</li>
                            <li>Start earning by helping patients</li>
                        </ul>

                        <p style="margin-top: 20px;">
                            <a href="{get_pharmacist_url()}" class="btn">Go to Dashboard</a>
                        </p>
                    </div>
                </div>
            </body>
            </html>
            """
        else:
            html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 24px; border-radius: 12px 12px 0 0; }}
                    .content {{ background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }}
                    .notes {{ background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin: 16px 0; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="margin: 0;">Application Update</h1>
                        <p style="margin: 8px 0 0; opacity: 0.9;">Your pharmacist application requires attention</p>
                    </div>
                    <div class="content">
                        <p>Dear {name},</p>
                        <p>Unfortunately, we were unable to verify your pharmacist application at this time.</p>

                        {f'<div class="notes"><strong>Reason:</strong><br>{notes}</div>' if notes else ''}

                        <p>If you believe this is an error or would like to resubmit with updated documents, please contact our support team.</p>
                    </div>
                </div>
            </body>
            </html>
            """

        text = f"""
{'Congratulations' if is_approved else 'Application Update'}, {name}!

Your pharmacist application has been {'approved' if is_approved else 'rejected'}.
{f'Reason: {notes}' if notes and not is_approved else ''}

{'You can now log in to your dashboard and start accepting consultations.' if is_approved else 'Please contact support if you have questions.'}
        """

        return await EmailService.send_email([email], subject, html, text)


def get_admin_url() -> str:
    """Get the admin dashboard URL."""
    import os
    return os.getenv("NEXT_PUBLIC_SITE_URL", "https://medirep-ai.vercel.app") + "/admin"


def get_pharmacist_url() -> str:
    """Get the pharmacist dashboard URL."""
    import os
    return os.getenv("NEXT_PUBLIC_SITE_URL", "https://medirep-ai.vercel.app") + "/pharmacist/dashboard"
