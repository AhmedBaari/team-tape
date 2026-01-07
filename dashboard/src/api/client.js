import axios from 'axios';

// Default to the correct port (7705) for TeamTape API
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7705/api/v1';

console.log('🔗 API Base URL:', API_BASE_URL);

// Create axios instance
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000, // 30 second timeout
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth token to requests
apiClient.interceptors.request.use(
    (config) => {
        const apiKey = localStorage.getItem('apiKey');
        if (apiKey) {
            config.headers.Authorization = `Bearer ${apiKey}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// API methods
export const api = {
    // Meetings
    getMeetings: (params) => apiClient.get('/meetings', { params }),
    getMeeting: (id) => apiClient.get(`/meetings/${id}`),
    getTranscript: (id) => apiClient.get(`/meetings/${id}/transcript`),
    getSummary: (id) => apiClient.get(`/meetings/${id}/summary`),
    getAudio: (id) => `${API_BASE_URL}/meetings/${id}/audio`,
    getParticipants: (id) => apiClient.get(`/meetings/${id}/participants`),

    // Analytics
    getUserSpeakingTime: (params) => apiClient.get('/analytics/user-speaking-time', { params }),
    getAnalyticsSummary: (params) => apiClient.get('/analytics/summary', { params }),
};

export default apiClient;
