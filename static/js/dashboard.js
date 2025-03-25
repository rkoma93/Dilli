function showCreateWaitlistModal() {
    document.getElementById('createWaitlistModal').classList.remove('hidden');
}

function hideCreateWaitlistModal() {
    document.getElementById('createWaitlistModal').classList.add('hidden');
}

async function handleCreateWaitlist(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    
    try {
        const response = await fetch('/waitlist/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(Object.fromEntries(formData))
        });
        
        if (!response.ok) throw new Error('Failed to create waitlist');
        
        const data = await response.json();
        window.location.reload();
    } catch (error) {
        console.error('Error creating waitlist:', error);
        alert('Failed to create waitlist. Please try again.');
    }
}

function copyWaitlistLink(slug) {
    const link = `${window.location.origin}/waitlist/${slug}`;
    navigator.clipboard.writeText(link)
        .then(() => alert('Link copied to clipboard!'))
        .catch(err => console.error('Failed to copy link:', err));
}

function showEditWaitlist(id) {
    // Implementation for edit functionality
    alert('Edit functionality coming soon!');
}
