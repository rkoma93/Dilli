function initializeCharts(data) {
    // Daily Signups Chart
    const dailyCtx = document.getElementById('dailySignupsChart').getContext('2d');
    new Chart(dailyCtx, {
        type: 'line',
        data: {
            labels: Object.keys(data.daily_joins),
            datasets: [{
                label: 'Daily Signups',
                data: Object.values(data.daily_joins),
                borderColor: '#6366F1',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });

    // Referral Performance Chart
    const referralCtx = document.getElementById('referralChart').getContext('2d');
    new Chart(referralCtx, {
        type: 'doughnut',
        data: {
            labels: ['Direct', 'Referral'],
            datasets: [{
                data: [
                    data.total_entries - data.total_referrals,
                    data.total_referrals
                ],
                backgroundColor: ['#10B981', '#F59E0B']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Initialize charts when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const analyticsData = JSON.parse(
        document.getElementById('analytics-data').textContent
    );
    initializeCharts(analyticsData);
});
