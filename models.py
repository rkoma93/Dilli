from datetime import datetime
import uuid
from app import db

class Waitlist(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    url_slug = db.Column(db.String(100), unique=True, nullable=False)
    website_url = db.Column(db.String(255))
    form_key = db.Column(db.String(8), unique=True, default=lambda: str(uuid.uuid4())[:8])
    custom_styles = db.Column(db.JSON)
    thank_you_page = db.Column(db.JSON, default={
        'title': 'Thank you for joining!',
        'message': 'You have been added to the waitlist.',
        'custom_html': ''
    })
    submission_settings = db.Column(db.JSON, default={
        'notify_email': '',
        'auto_response': True,
        'response_email_template': 'default'
    })
    is_published = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.String(100), nullable=False)  # Supabase user ID

class WaitlistEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    waitlist_id = db.Column(db.Integer, db.ForeignKey('waitlist.id'), nullable=False)
    email = db.Column(db.String(120), nullable=False)
    position = db.Column(db.Integer, nullable=False)
    referral_code = db.Column(db.String(20), unique=True)
    referral_count = db.Column(db.Integer, default=0)
    referred_by = db.Column(db.Integer, db.ForeignKey('waitlist_entry.id'))
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)