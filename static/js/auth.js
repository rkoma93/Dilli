async function signIn() {
    try {
        const email = prompt('Please enter your email:');
        const password = prompt('Please enter your password:');

        if (!email || !password) {
            throw new Error('Email and password are required');
        }

        const response = await fetch('/auth/signin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) throw new Error('Failed to sign in');

        const data = await response.json();
        if (data.success) {
            window.location.href = '/dashboard';
        } else {
            throw new Error(data.error || 'Authentication failed');
        }
    } catch (error) {
        console.error('Error signing in:', error.message);
        alert('Failed to sign in. Please try again.');
    }
}

async function signUp() {
    try {
        const email = prompt('Please enter your email:');
        const password = prompt('Please enter your password:');

        if (!email || !password) {
            throw new Error('Email and password are required');
        }

        const response = await fetch('/auth/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) throw new Error('Failed to sign up');

        const data = await response.json();
        if (data.success) {
            alert('Successfully signed up! Please check your email to confirm your account.');
            window.location.href = '/';
        } else {
            throw new Error(data.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Error signing up:', error.message);
        alert('Failed to sign up. Please try again.');
    }
}

async function signOut() {
    try {
        const response = await fetch('/auth/signout', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to sign out');

        window.location.href = '/';
    } catch (error) {
        console.error('Error signing out:', error.message);
        alert('Failed to sign out. Please try again.');
    }
}