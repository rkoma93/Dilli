from flask import render_template, request, redirect, url_for, flash, jsonify, session
from app import app, db, supabase
from models import Waitlist, WaitlistEntry
from forms import SignupForm, SigninForm
import uuid
import logging

logger = logging.getLogger(__name__)

@app.route('/auth/signup', methods=['GET', 'POST'])
def signup():
    form = SignupForm()
    if form.validate_on_submit():
        try:
            logger.info("Processing signup form submission")
            # Sign up with Supabase
            response = supabase.auth.sign_up({
                'email': form.email.data,
                'password': form.password.data
            })

            logger.info("User signup successful")
            flash('Successfully signed up! Please check your email to confirm your account.', 'success')
            return redirect(url_for('signin'))
        except Exception as e:
            logger.error(f"Signup error: {str(e)}")
            flash('Failed to sign up. Please try again.', 'error')

    return render_template('auth/signup.html', form=form)

@app.route('/auth/signin', methods=['GET', 'POST'])
def signin():
    if 'user' in session:
        return redirect(url_for('dashboard'))

    form = SigninForm()
    if form.validate_on_submit():
        try:
            logger.info("Processing signin form submission")
            # Sign in with Supabase
            response = supabase.auth.sign_in_with_password({
                'email': form.email.data,
                'password': form.password.data
            })

            # Store session data
            session['access_token'] = response.session.access_token
            session['user'] = {
                'id': response.user.id,
                'email': response.user.email
            }

            logger.info("User signin successful")
            flash('Successfully signed in!', 'success')
            return redirect(url_for('dashboard'))
        except Exception as e:
            logger.error(f"Signin error: {str(e)}")
            flash('Invalid email or password.', 'error')

    return render_template('auth/signin.html', form=form)

@app.route('/auth/signout', methods=['POST'])
def signout():
    try:
        logger.info("Initiating sign-out process")
        supabase.auth.sign_out()
        session.clear()
        logger.info("User signed out successfully")
        flash('Successfully signed out!', 'success')
        return redirect(url_for('index'))
    except Exception as e:
        logger.error(f"Sign out error: {str(e)}")
        flash('Error signing out.', 'error')
        return redirect(url_for('dashboard'))

@app.route('/auth/signin/google', methods=['POST'])
def signin_google():
    try:
        logger.info("Initiating Google sign-in process")
        redirect_to = url_for('auth_callback', _external=True)
        # Initialize OAuth sign in with Google
        response = supabase.auth.sign_in_with_oauth({
            'provider': 'google',
            'options': {
                'redirect_to': redirect_to
            }
        })
        logger.info("Generated OAuth URL for Google sign-in")
        return jsonify({'authUrl': response.url})
    except Exception as e:
        logger.error(f"Sign in error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/auth/callback')
def auth_callback():
    try:
        logger.info("Processing auth callback")
        # Get the session from the OAuth callback
        session_data = supabase.auth.get_session()
        if not session_data:
            logger.warning("No session data received in callback")
            flash('Authentication failed', 'error')
            return redirect(url_for('index'))

        logger.info("Setting up user session")
        session['access_token'] = session_data.access_token
        session['user'] = {
            'id': session_data.user.id,
            'email': session_data.user.email
        }

        return redirect(url_for('dashboard'))
    except Exception as e:
        logger.error(f"Auth callback error: {str(e)}")
        flash('Authentication failed', 'error')
        return redirect(url_for('index'))

@app.route('/')
def index():
    logger.info("Accessing index page")
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    try:
        logger.info("Accessing dashboard")
        if 'user' not in session:
            logger.warning("Unauthorized dashboard access attempt")
            return redirect(url_for('index'))

        user_id = session['user']['id']
        waitlists = Waitlist.query.filter_by(user_id=user_id).all()
        logger.info(f"Retrieved {len(waitlists)} waitlists for user")
        return render_template('dashboard.html', waitlists=waitlists)
    except Exception as e:
        logger.error(f"Dashboard error: {str(e)}")
        flash("Error accessing dashboard", "error")
        return redirect(url_for('index'))


@app.route('/waitlist/create', methods=['POST'])
def create_waitlist():
    try:
        logger.info("Creating a new waitlist")
        if 'user' not in session:
            return jsonify({'error': 'Unauthorized'}), 401

        data = request.json
        waitlist = Waitlist(
            name=data['name'],
            description=data['description'],
            url_slug=data['url_slug'],
            custom_styles=data.get('custom_styles', {}),
            user_id=session['user']['id']
        )
        db.session.add(waitlist)
        db.session.commit()
        logger.info(f"Waitlist '{waitlist.name}' created successfully")
        return jsonify({'id': waitlist.id})
    except Exception as e:
        logger.error(f"Create waitlist error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/waitlist/<string:slug>/join', methods=['POST'])
def join_waitlist(slug):
    try:
        logger.info(f"User joining waitlist with slug: {slug}")
        waitlist = Waitlist.query.filter_by(url_slug=slug).first_or_404()
        data = request.json

        # Generate position number
        last_entry = WaitlistEntry.query.filter_by(waitlist_id=waitlist.id).order_by(
            WaitlistEntry.position.desc()
        ).first()
        position = (last_entry.position + 1) if last_entry else 1

        entry = WaitlistEntry(
            waitlist_id=waitlist.id,
            email=data['email'],
            position=position,
            referral_code=str(uuid.uuid4())[:8],
            referred_by=data.get('referred_by')
        )

        if entry.referred_by:
            referrer = WaitlistEntry.query.get(entry.referred_by)
            if referrer:
                referrer.referral_count += 1

        db.session.add(entry)
        db.session.commit()
        logger.info(f"User joined waitlist '{waitlist.name}' at position {position}")
        return jsonify({
            'position': position,
            'referral_code': entry.referral_code
        })
    except Exception as e:
        logger.error(f"Join waitlist error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/analytics/<int:waitlist_id>')
def analytics(waitlist_id):
    try:
        logger.info(f"Accessing analytics for waitlist ID: {waitlist_id}")
        if 'user' not in session:
            return redirect(url_for('index'))

        waitlist = Waitlist.query.get_or_404(waitlist_id)
        if waitlist.user_id != session['user']['id']:
            return jsonify({'error': 'Unauthorized'}), 401

        entries = WaitlistEntry.query.filter_by(waitlist_id=waitlist_id).all()
        analytics_data = {
            'total_entries': len(entries),
            'total_referrals': sum(e.referral_count for e in entries),
            'daily_joins': {}  # Implement daily join count logic
        }

        return render_template('analytics.html', waitlist=waitlist, analytics=analytics_data)
    except Exception as e:
        logger.error(f"Analytics error: {str(e)}")
        return redirect(url_for('dashboard'))

@app.route('/waitlist/<int:waitlist_id>/settings')
def waitlist_settings(waitlist_id):
    try:
        logger.info(f"Accessing settings for waitlist ID: {waitlist_id}")
        if 'user' not in session:
            return redirect(url_for('index'))

        waitlist = Waitlist.query.get_or_404(waitlist_id)
        if waitlist.user_id != session['user']['id']:
            flash('You do not have permission to access these settings.', 'error')
            return redirect(url_for('dashboard'))

        return render_template('settings.html', waitlist=waitlist)
    except Exception as e:
        logger.error(f"Settings page error: {str(e)}")
        flash('Error accessing settings', 'error')
        return redirect(url_for('dashboard'))

@app.route('/waitlist/<int:waitlist_id>/settings/basic', methods=['POST'])
def update_basic_settings(waitlist_id):
    try:
        if 'user' not in session:
            return jsonify({'error': 'Unauthorized'}), 401

        waitlist = Waitlist.query.get_or_404(waitlist_id)
        if waitlist.user_id != session['user']['id']:
            return jsonify({'error': 'Unauthorized'}), 401

        data = request.json
        waitlist.name = data.get('name', waitlist.name)
        waitlist.website_url = data.get('website_url', waitlist.website_url)

        db.session.commit()
        logger.info(f"Updated basic settings for waitlist: {waitlist_id}")
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Basic settings update error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/waitlist/<int:waitlist_id>/settings/thank-you', methods=['POST'])
def update_thank_you_settings(waitlist_id):
    try:
        if 'user' not in session:
            return jsonify({'error': 'Unauthorized'}), 401

        waitlist = Waitlist.query.get_or_404(waitlist_id)
        if waitlist.user_id != session['user']['id']:
            return jsonify({'error': 'Unauthorized'}), 401

        data = request.json
        waitlist.thank_you_page = {
            'title': data.get('title', waitlist.thank_you_page.get('title')),
            'message': data.get('message', waitlist.thank_you_page.get('message')),
            'custom_html': data.get('custom_html', waitlist.thank_you_page.get('custom_html'))
        }

        db.session.commit()
        logger.info(f"Updated thank you page settings for waitlist: {waitlist_id}")
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Thank you page settings update error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/waitlist/<int:waitlist_id>/settings/submissions', methods=['POST'])
def update_submission_settings(waitlist_id):
    try:
        if 'user' not in session:
            return jsonify({'error': 'Unauthorized'}), 401

        waitlist = Waitlist.query.get_or_404(waitlist_id)
        if waitlist.user_id != session['user']['id']:
            return jsonify({'error': 'Unauthorized'}), 401

        data = request.json
        waitlist.submission_settings = {
            'notify_email': data.get('notify_email', waitlist.submission_settings.get('notify_email')),
            'auto_response': data.get('auto_response', waitlist.submission_settings.get('auto_response')),
            'response_email_template': data.get('response_email_template', waitlist.submission_settings.get('response_email_template'))
        }

        db.session.commit()
        logger.info(f"Updated submission settings for waitlist: {waitlist_id}")
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Submission settings update error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Add these routes after the existing routes

@app.route('/waitlist/<int:waitlist_id>/submissions', endpoint='submissions')
def submissions(waitlist_id):
    try:
        logger.info(f"Accessing submissions for waitlist ID: {waitlist_id}")
        if 'user' not in session:
            return redirect(url_for('index'))

        waitlist = Waitlist.query.get_or_404(waitlist_id)
        if waitlist.user_id != session['user']['id']:
            flash('You do not have permission to access these submissions.', 'error')
            return redirect(url_for('dashboard'))

        entries = WaitlistEntry.query.filter_by(waitlist_id=waitlist_id).all()
        return render_template('submissions.html', waitlist=waitlist, entries=entries)
    except Exception as e:
        logger.error(f"Submissions page error: {str(e)}")
        flash('Error accessing submissions', 'error')
        return redirect(url_for('dashboard'))

@app.route('/waitlist/<int:waitlist_id>/embed-form', endpoint='embed_form')
def embed_form(waitlist_id):
    try:
        logger.info(f"Accessing embed form for waitlist ID: {waitlist_id}")
        if 'user' not in session:
            return redirect(url_for('index'))

        waitlist = Waitlist.query.get_or_404(waitlist_id)
        if waitlist.user_id != session['user']['id']:
            flash('You do not have permission to access this form.', 'error')
            return redirect(url_for('dashboard'))

        return render_template('integration/embed_form.html', waitlist=waitlist)
    except Exception as e:
        logger.error(f"Embed form page error: {str(e)}")
        flash('Error accessing embed form', 'error')
        return redirect(url_for('dashboard'))

@app.route('/waitlist/<int:waitlist_id>/custom-form', endpoint='custom_form')
def custom_form(waitlist_id):
    try:
        logger.info(f"Accessing custom form for waitlist ID: {waitlist_id}")
        if 'user' not in session:
            return redirect(url_for('index'))

        waitlist = Waitlist.query.get_or_404(waitlist_id)
        if waitlist.user_id != session['user']['id']:
            flash('You do not have permission to access this form.', 'error')
            return redirect(url_for('dashboard'))

        return render_template('integration/custom_form.html', waitlist=waitlist)
    except Exception as e:
        logger.error(f"Custom form page error: {str(e)}")
        flash('Error accessing custom form', 'error')
        return redirect(url_for('dashboard'))

@app.route('/waitlist/<int:waitlist_id>/leaderboard', endpoint='leaderboard')
def leaderboard(waitlist_id):
    try:
        logger.info(f"Accessing leaderboard for waitlist ID: {waitlist_id}")
        if 'user' not in session:
            return redirect(url_for('index'))

        waitlist = Waitlist.query.get_or_404(waitlist_id)
        if waitlist.user_id != session['user']['id']:
            flash('You do not have permission to access this leaderboard.', 'error')
            return redirect(url_for('dashboard'))

        return render_template('integration/leaderboard.html', waitlist=waitlist)
    except Exception as e:
        logger.error(f"Leaderboard page error: {str(e)}")
        flash('Error accessing leaderboard', 'error')
        return redirect(url_for('dashboard'))

@app.route('/waitlist/<int:waitlist_id>/plugins', endpoint='plugins')
def plugins(waitlist_id):
    try:
        logger.info(f"Accessing plugins for waitlist ID: {waitlist_id}")
        if 'user' not in session:
            return redirect(url_for('index'))

        waitlist = Waitlist.query.get_or_404(waitlist_id)
        if waitlist.user_id != session['user']['id']:
            flash('You do not have permission to access these plugins.', 'error')
            return redirect(url_for('dashboard'))

        return render_template('plugins.html', waitlist=waitlist)
    except Exception as e:
        logger.error(f"Plugins page error: {str(e)}")
        flash('Error accessing plugins', 'error')
        return redirect(url_for('dashboard'))

@app.route('/waitlist/<int:waitlist_id>/integration', endpoint='integration')
def integration(waitlist_id):
    try:
        logger.info(f"Accessing integration for waitlist ID: {waitlist_id}")
        if 'user' not in session:
            return redirect(url_for('index'))

        waitlist = Waitlist.query.get_or_404(waitlist_id)
        if waitlist.user_id != session['user']['id']:
            flash('You do not have permission to access this integration.', 'error')
            return redirect(url_for('dashboard'))

        return render_template('integration.html', waitlist=waitlist)
    except Exception as e:
        logger.error(f"Integration page error: {str(e)}")
        flash('Error accessing integration', 'error')
        return redirect(url_for('dashboard'))