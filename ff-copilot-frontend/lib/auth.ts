// Frontend auth service to connect with FastAPI backend

export interface User {
  email: string;
  name: string;
  league_id: number;
  year: number;
  team_name: string;
  team_id: number;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface SignupData {
  name: string;
  email: string;
  league_id: number;
  year: number;
  team_name: string;
  team_id: number;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

const API_BASE_URL = 'http://localhost:8000';

export class AuthService {
  static async login(loginData: LoginData): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(loginData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Login failed');
    }

    const authResponse = await response.json();
    
    // Store token in localStorage
    localStorage.setItem('access_token', authResponse.access_token);
    localStorage.setItem('user', JSON.stringify(authResponse.user));
    
    return authResponse;
  }

  static async signup(signupData: SignupData): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(signupData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Signup failed');
    }

    const authResponse = await response.json();
    
    // Store token in localStorage
    localStorage.setItem('access_token', authResponse.access_token);
    localStorage.setItem('user', JSON.stringify(authResponse.user));
    
    return authResponse;
  }

  static logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
  }

  static getToken(): string | null {
    return localStorage.getItem('access_token');
  }

  static getUser(): User | null {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  static isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // Helper method to make authenticated API calls
  static async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getToken();
    
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    return fetch(url, {
      ...options,
      headers,
    });
  }

  // Fetch teams for a given league and year
  static async getTeams(league_id: number, year: number): Promise<{ teams: [string, number][] }> {
    const response = await fetch(`${API_BASE_URL}/get_teams_auth?league_id=${league_id}&year=${year}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch teams');
    }
    
    return response.json();
  }
}
