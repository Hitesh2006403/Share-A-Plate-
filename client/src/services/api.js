// Unified API client: seamlessly toggles between local mock storage and live backend REST APIs
import {
  INITIAL_USERS,
  INITIAL_DONATIONS,
  INITIAL_RECIPIENT_REQUIREMENTS,
  INITIAL_DELIVERY_TASKS,
  INITIAL_IMPACT_METRICS,
  INITIAL_REVIEWS,
  INITIAL_VERIFIED_HANDOVERS,
  INITIAL_PARTNERS_DIRECTORY,
} from './mockData';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Local storage keys for persisting mock state across browser refreshes
const STORAGE_KEYS = {
  USERS: 'sap_users_v1',
  DONATIONS: 'sap_donations_v1',
  REQUIREMENTS: 'sap_requirements_v1',
  TASKS: 'sap_tasks_v1',
  METRICS: 'sap_metrics_v1',
  CURRENT_USER: 'sap_current_user_v1',
  REVIEWS: 'sap_reviews_v1',
};

// State initializer
const loadOrInit = (key, initial) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (key === STORAGE_KEYS.DONATIONS && Array.isArray(parsed)) {
      const existingIds = new Set(parsed.map((d) => d.id));
      const enriched = parsed.map((d) => {
        if (!d.venueType) {
          const match = initial.find((init) => init.id === d.id);
          if (match?.venueType) return { ...d, venueType: match.venueType };
          const text = `${d.donorName || ''} ${d.foodName || ''}`.toLowerCase();
          if (/hotel|hyatt|sheraton/i.test(text)) return { ...d, venueType: 'HOTELS' };
          if (/restaurant|resturant|bistro|bakery/i.test(text)) return { ...d, venueType: 'Resturant' };
          if (/catering|event|venue|pavilion/i.test(text)) return { ...d, venueType: 'Event venue' };
          return { ...d, venueType: 'Others' };
        }
        return d;
      });
      for (const item of initial) {
        if (!existingIds.has(item.id)) enriched.push(item);
      }
      localStorage.setItem(key, JSON.stringify(enriched));
      return enriched;
    }
    return parsed;
  } catch {
    return initial;
  }
};

const save = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
};

// Initialize in-memory / persisted mock store
let mockUsers = loadOrInit(STORAGE_KEYS.USERS, INITIAL_USERS);
let mockDonations = loadOrInit(STORAGE_KEYS.DONATIONS, INITIAL_DONATIONS);
let mockRequirements = loadOrInit(STORAGE_KEYS.REQUIREMENTS, INITIAL_RECIPIENT_REQUIREMENTS);
let mockTasks = loadOrInit(STORAGE_KEYS.TASKS, INITIAL_DELIVERY_TASKS);
let mockMetrics = loadOrInit(STORAGE_KEYS.METRICS, INITIAL_IMPACT_METRICS);
let mockReviews = loadOrInit(STORAGE_KEYS.REVIEWS, INITIAL_REVIEWS);

// Simulated network delay helper
const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export const api = {
  // ----------------------------------------------------
  // AUTHENTICATION
  // ----------------------------------------------------
  login: async (email, password) => {
    if (!USE_MOCK) {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Invalid credentials');
      }
      const user = data.data?.user || data.user;
      const token = data.data?.token || data.token;
      if (token) {
        localStorage.setItem('sap_jwt_token', token);
      }
      if (user) {
        if (!user.id && user._id) user.id = user._id;
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      }
      return { token, user };
    }

    await delay(150);
    const user = mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      throw new Error('User not found. Use one-click member login or register.');
    }
    if (password && user.password && password !== user.password && password !== 'password123') {
      throw new Error('Incorrect password. Please use the member credentials provided on the card.');
    }
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    return { token: 'mock-jwt-token-' + user.id, user };
  },

  // Genuine Google OAuth 2.0 Credential Verification on Backend
  loginWithGoogle: async (credential, role = 'donor', portalVerificationData = {}) => {
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ credential, role, portalVerificationData }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Google authentication rejected by server.');
      }
      const user = data.data?.user || data.user;
      const token = data.data?.token || data.token;
      if (token) {
        localStorage.setItem('sap_jwt_token', token);
      }
      if (user) {
        if (!user.id && user._id) user.id = user._id;
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      }
      return { token, user };
    } catch (err) {
      throw err;
    }
  },

  getMe: async () => {
    try {
      const token = localStorage.getItem('sap_jwt_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'GET',
        headers,
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      const user = data.data?.user || data.user;
      if (user) {
        if (!user.id && user._id) user.id = user._id;
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
        return user;
      }
      return null;
    } catch {
      return null;
    }
  },

  logoutSession: async () => {
    try {
      const token = localStorage.getItem('sap_jwt_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
    } catch {
      // ignore
    }
    localStorage.removeItem('sap_jwt_token');
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  },

  register: async (userData) => {
    if (!USE_MOCK) {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(userData),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Registration failed');
      }
      const user = data.data?.user || data.user;
      const token = data.data?.token || data.token;
      if (token) {
        localStorage.setItem('sap_jwt_token', token);
      }
      if (user) {
        if (!user.id && user._id) user.id = user._id;
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      }
      return { token, user };
    }

    await delay();
    const newUser = {
      id: 'user-' + Date.now(),
      ...userData,
      rating: 5.0,
      totalDonations: 0,
      verified: true,
    };
    mockUsers.push(newUser);
    save(STORAGE_KEYS.USERS, mockUsers);
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(newUser));
    return { token: 'mock-jwt-token-' + newUser.id, user: newUser };
  },

  getCurrentUser: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    // Default to Donor for instant preview
    const defaultUser = mockUsers[0];
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(defaultUser));
    return defaultUser;
  },

  switchUser: (userId) => {
    const user = mockUsers.find((u) => u.id === userId);
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      localStorage.setItem('sap_jwt_token', 'mock-jwt-token-' + user.id);
    }
    return user;
  },

  getAllUsers: () => mockUsers,

  getMeta: async () => {
    try {
      const res = await fetch(`${API_BASE}/meta`);
      const json = await res.json();
      if (res.ok && json.data) {
        return json.data;
      }
    } catch (e) {
      console.warn('Failed to fetch /meta, using fallback:', e);
    }
    return {
      priorities: [
        { value: 'LOW', label: 'Low', weight: 1 },
        { value: 'MEDIUM', label: 'Medium', weight: 2 },
        { value: 'HIGH', label: 'High', weight: 3 },
      ],
      priorityWeights: { LOW: 1, MEDIUM: 2, HIGH: 3 },
    };
  },

  // ----------------------------------------------------
  // DONATIONS (Donor Journey)
  // ----------------------------------------------------
  getDonations: async (filter = {}) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const params = new URLSearchParams();
        Object.entries(filter).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            params.append(k, Array.isArray(v) ? v.join(',') : v);
          }
        });
        const query = params.toString();
        const res = await fetch(`${API_BASE}/donations${query ? `?${query}` : ''}`, {
          headers,
          credentials: 'include',
        });
        const json = await res.json();
        if (res.ok) {
          const list = Array.isArray(json) ? json : (json.data || []);
          return list.map((d) => ({
            ...d,
            id: d.id || d._id,
            priority: d.priority || 'MEDIUM',
            priorityWeight: d.priorityWeight || 2,
            totalQuantity: d.totalQuantity || d.initialQuantity || 10,
            remainingQuantity: d.remainingQuantity !== undefined ? d.remainingQuantity : (d.totalQuantity || d.initialQuantity || 10),
            venueType: d.areaLabel || d.venueType || 'Others',
            donorName: d.donorId?.name || d.donorName || 'Verified Donor Kitchen',
            donorPhone: d.donorId?.phone || d.donorPhone || '+91 98765 43210',
            pickupLocation: d.address
              ? {
                  address: d.address.formattedAddress || d.address.street || d.address.city,
                  coordinates: d.location?.coordinates || [77.62, 12.97],
                }
              : d.pickupLocation,
          }));
        }
      } catch (e) {
        console.warn('Live donations fetch error, using local fallback:', e);
      }
    }

    await delay(150);
    let list = [...mockDonations];
    if (filter.donorId) {
      list = list.filter((d) => d.donorId === filter.donorId);
    }
    if (filter.status && filter.status !== 'ALL') {
      list = list.filter((d) => d.status === filter.status);
    }
    return list;
  },

  createDonation: async (donationData) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const now = new Date();
        const cookedAt = donationData.cookedTime ? new Date(donationData.cookedTime) : new Date(now.getTime() - 30 * 60 * 1000);
        const expiryAt = donationData.expiryDeadline ? new Date(donationData.expiryDeadline) : new Date(now.getTime() + 4 * 60 * 60 * 1000);
        const safetyBufferMinutes = Number(donationData.safetyBufferMinutes) || 60;
        const pickupWindowStart = new Date(now.getTime() + 5 * 60 * 1000);
        const effectiveExpiry = new Date(expiryAt.getTime() - safetyBufferMinutes * 60 * 1000);
        const pickupWindowEnd = new Date(Math.min(now.getTime() + 2 * 60 * 60 * 1000, effectiveExpiry.getTime() - 5 * 60 * 1000));

        const rawFoodType = (donationData.foodType || 'cooked_meals').toLowerCase();
        const foodType = ['cooked_meals', 'raw_groceries', 'packaged_food', 'bakery_items'].includes(rawFoodType)
          ? rawFoodType
          : 'cooked_meals';

        const rawDiet = (donationData.dietaryCategory || donationData.dietaryType || 'vegetarian').toLowerCase();
        const dietaryType = ['vegetarian', 'non_vegetarian', 'vegan'].includes(rawDiet)
          ? rawDiet
          : 'vegetarian';

        const rawUnit = (donationData.unit || 'plates').toLowerCase();
        const unit = ['plates', 'kg', 'packets', 'servings'].includes(rawUnit)
          ? rawUnit
          : 'plates';

        const coords = donationData.pickupLocation?.coordinates || [77.62, 12.97];
        const formattedAddress = donationData.pickupLocation?.address || 'Indiranagar, Bengaluru';

        const payload = {
          foodName: donationData.foodName,
          foodType,
          dietaryType,
          totalQuantity: Math.round(Number(donationData.initialQuantity || donationData.totalQuantity || 10)),
          unit,
          cookedAt,
          expiryAt,
          safetyBufferMinutes,
          pickupWindowStart,
          pickupWindowEnd,
          packagingType: 'sealed_containers',
          instructions: donationData.storageCondition || donationData.instructions || 'Keep refrigerated until collection',
          location: {
            type: 'Point',
            coordinates: coords,
          },
          address: {
            city: 'Bengaluru',
            formattedAddress,
          },
          areaLabel: donationData.venueType || 'Local Area',
          priority: (donationData.priority || 'MEDIUM').toUpperCase(),
        };

        const res = await fetch(`${API_BASE}/donations`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (res.ok) {
          const created = json.data || json;
          return { ...created, id: created.id || created._id, priority: created.priority || payload.priority };
        }
      } catch (err) {
        console.warn('Backend createDonation error, saving locally:', err);
      }
    }
    await delay(300);
    const newDonation = {
      id: 'don-' + Math.floor(100 + Math.random() * 900),
      createdAt: new Date().toISOString(),
      status: 'AVAILABLE',
      remainingQuantity: Number(donationData.initialQuantity),
      handoverQrToken: 'SAP-QR-' + Date.now().toString(36).toUpperCase(),
      matchedRecipients: [],
      priority: (donationData.priority || 'MEDIUM').toUpperCase(),
      ...donationData,
    };
    mockDonations.unshift(newDonation);
    save(STORAGE_KEYS.DONATIONS, mockDonations);

    // Update impact counters
    mockMetrics.activeDonationsCount += 1;
    save(STORAGE_KEYS.METRICS, mockMetrics);

    return newDonation;
  },

  updateDonation: async (donationId, updateData) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/donations/${donationId}`, {
          method: 'PATCH',
          headers,
          credentials: 'include',
          body: JSON.stringify(updateData),
        });
        const json = await res.json();
        if (res.ok) {
          const updated = json.data || json;
          return { ...updated, id: updated.id || updated._id };
        }
        throw new Error(json.message || 'Failed to update donation');
      } catch (e) {
        console.warn('Backend updateDonation error:', e);
        throw e;
      }
    }
    await delay(150);
    const don = mockDonations.find((d) => d.id === donationId || d._id === donationId);
    if (!don) throw new Error('Donation not found');
    Object.assign(don, updateData);
    save(STORAGE_KEYS.DONATIONS, mockDonations);
    return don;
  },

  reopenDonation: async (donationId, notes = '') => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/donations/${donationId}/reopen`, {
          method: 'PATCH',
          headers,
          credentials: 'include',
          body: JSON.stringify({ notes }),
        });
        const json = await res.json();
        if (res.ok) {
          const don = json.data || json;
          return { ...don, id: don.id || don._id };
        }
      } catch (e) {
        console.warn('Backend reopenDonation error:', e);
      }
    }
    await delay(200);
    const don = mockDonations.find((d) => d.id === donationId);
    if (!don) throw new Error('Donation not found');

    don.status = 'REOPENED';
    don.canReopen = false;
    don.reopenedAt = new Date().toISOString();
    don.reopenNotes = notes || 'Reopened and offered to nearby community shelters';
    save(STORAGE_KEYS.DONATIONS, mockDonations);
    return don;
  },

  // ----------------------------------------------------
  // RECIPIENT JOURNEY & PARTIAL ACCEPTANCE
  // ----------------------------------------------------
  getRequirements: async (filter = {}) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const params = new URLSearchParams();
        Object.entries(filter).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            params.append(k, Array.isArray(v) ? v.join(',') : v);
          }
        });
        const queryStr = params.toString();
        const res = await fetch(`${API_BASE}/requirements${queryStr ? `?${queryStr}` : ''}`, {
          headers,
          credentials: 'include',
        });
        const json = await res.json();
        if (res.ok) {
          const list = Array.isArray(json) ? json : (json.data || []);
          return list.map((r) => ({
            ...r,
            id: r.id || r._id,
            priority: r.priority || 'MEDIUM',
            urgency: r.urgency || r.priority || 'MEDIUM',
          }));
        }
      } catch (e) {
        console.warn('Backend requirements fetch error, using local fallback:', e);
      }
    }
    await delay(100);
    return mockRequirements.map((r) => ({
      ...r,
      priority: r.priority || 'MEDIUM',
      urgency: r.urgency || r.priority || 'MEDIUM',
    }));
  },

  postRequirement: async (reqData) => {
    const effPriority = (reqData.priority || reqData.urgency || 'MEDIUM').toUpperCase();
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const payload = {
          title: reqData.title || `Requirement for ${reqData.foodType || 'food'}`,
          foodType: ['cooked_meals', 'raw_groceries', 'packaged_food', 'bakery_items'].includes(reqData.foodType)
            ? reqData.foodType
            : 'cooked_meals',
          quantityNeeded: Math.round(Number(reqData.quantityNeeded || 20)),
          unit: ['plates', 'kg', 'packets', 'servings'].includes(reqData.unit) ? reqData.unit : 'plates',
          dietaryPreference: ['vegetarian', 'non_vegetarian', 'vegan', 'any'].includes(reqData.dietaryPreference)
            ? reqData.dietaryPreference
            : 'any',
          neededBy: reqData.neededBefore || reqData.neededBy || new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          priority: effPriority === 'CRITICAL' ? 'HIGH' : effPriority,
          location: {
            type: 'Point',
            coordinates: [77.62, 12.97],
          },
          address: {
            city: 'Bengaluru',
            formattedAddress: reqData.location || 'Local Community Center, Bengaluru',
          },
        };
        const res = await fetch(`${API_BASE}/requirements`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (res.ok) {
          const created = json.data || json;
          return {
            ...created,
            id: created.id || created._id,
            priority: created.priority || payload.priority,
            urgency: created.urgency || payload.priority,
          };
        }
      } catch (e) {
        console.warn('Backend postRequirement error, saving locally:', e);
      }
    }
    await delay(250);
    const newReq = {
      id: 'req-' + Math.floor(200 + Math.random() * 800),
      createdAt: new Date().toISOString(),
      status: 'OPEN',
      ...reqData,
      priority: effPriority === 'CRITICAL' ? 'HIGH' : effPriority,
      urgency: effPriority === 'CRITICAL' ? 'HIGH' : effPriority,
    };
    mockRequirements.unshift(newReq);
    save(STORAGE_KEYS.REQUIREMENTS, mockRequirements);
    return newReq;
  },

  updateRequirement: async (requirementId, reqData) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/requirements/${requirementId}`, {
          method: 'PATCH',
          headers,
          credentials: 'include',
          body: JSON.stringify(reqData),
        });
        const json = await res.json();
        if (res.ok) {
          const updated = json.data || json;
          return {
            ...updated,
            id: updated.id || updated._id,
            priority: updated.priority || 'MEDIUM',
            urgency: updated.urgency || updated.priority || 'MEDIUM',
          };
        }
        throw new Error(json.message || 'Failed to update requirement');
      } catch (e) {
        console.warn('Backend updateRequirement error:', e);
        throw e;
      }
    }
    await delay(150);
    const req = mockRequirements.find((r) => r.id === requirementId || r._id === requirementId);
    if (!req) throw new Error('Requirement not found');
    Object.assign(req, reqData);
    save(STORAGE_KEYS.REQUIREMENTS, mockRequirements);
    return req;
  },


  getSmartMatches: async (recipientId) => {
    if (!USE_MOCK) {
      try {
        const res = await fetch(`${API_BASE}/recipient/matches?recipientId=${recipientId || ''}`);
        const json = await res.json();
        if (res.ok) {
          const list = Array.isArray(json) ? json : (json.data || []);
          if (list.length > 0) return list;
        }
      } catch (e) {
        console.warn('Backend smart matches error, using algorithmic fallback:', e);
      }
    }
    await delay(200);
    // Find active donations that have remaining food
    const eligible = mockDonations.filter(
      (d) => (d.status === 'AVAILABLE' || d.status === 'PARTIALLY_ACCEPTED' || d.status === 'REOPENED') && d.remainingQuantity > 0
    );

    // Calculate smart match scores with reasoning tags
    return eligible.map((don, idx) => {
      const expiryMs = new Date(don.expiryDeadline).getTime() - Date.now();
      const hoursLeft = Math.max(0.5, expiryMs / (1000 * 60 * 60));
      
      let baseScore = 95 - idx * 3;
      if (hoursLeft < 2) baseScore += 4; // Urgency boost
      const score = Math.min(99, Math.max(78, Math.round(baseScore)));

      const reasons = [
        `Within ${ (1.1 + idx * 0.7).toFixed(1) } km radius`,
        hoursLeft < 2 ? 'High Urgency: Ready for immediate collection' : 'Verified hygiene packaging',
        `${don.remainingQuantity} ${don.unit} surplus available`,
      ];

      return {
        donation: don,
        matchScore: score,
        distanceKm: (1.1 + idx * 0.7).toFixed(1),
        reasons,
      };
    });
  },

  acceptDonation: async ({ donationId, recipientId, recipientName, quantityAccepted, notes, deliveryFee }) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/donations/${donationId}/accept`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            recipientId,
            quantityAccepted: Number(quantityAccepted),
            notes,
            deliveryFee,
          }),
        });
        const json = await res.json();
        if (res.ok) {
          const updatedDonation = json.data || json;
          const donNorm = { ...updatedDonation, id: updatedDonation.id || updatedDonation._id };
          const task = {
            id: 'task-' + Math.floor(400 + Math.random() * 600),
            donationId: donNorm.id,
            deliveryAgentId: 'agent@delivery.com',
            foodName: donNorm.foodName,
            quantity: `${quantityAccepted} ${donNorm.unit || 'plates'}`,
            foodType: donNorm.foodType,
            currentMilestone: 'ASSIGNED',
            pickup: {
              location: donNorm.address?.formattedAddress || 'Donor Location',
              donorName: donNorm.donorId?.name || donNorm.donorName || 'Donor Kitchen',
              donorPhone: donNorm.donorId?.phone || '+91 98765 43210',
            },
            dropoff: {
              location: 'Recipient Shelter Location',
              recipientName: recipientName || 'Recipient Partner',
              recipientPhone: '+91 91234 56789',
            },
          };
          return { donation: donNorm, task };
        }
      } catch (e) {
        console.warn('Backend claim error, using local fallback:', e);
      }
    }
    await delay(300);
    const don = mockDonations.find((d) => d.id === donationId);
    if (!don) throw new Error('Donation not found');

    const qty = Number(quantityAccepted);
    if (qty <= 0 || qty > don.remainingQuantity) {
      throw new Error(`Invalid quantity. Must be between 1 and ${don.remainingQuantity}`);
    }

    don.remainingQuantity -= qty;
    if (don.remainingQuantity === 0) {
      don.status = 'ACCEPTED';
    } else {
      don.status = 'PARTIALLY_ACCEPTED';
    }

    if (!don.matchedRecipients) don.matchedRecipients = [];
    don.matchedRecipients.push({
      recipientId,
      recipientName,
      claimedQuantity: qty,
      claimedAt: new Date().toISOString(),
      notes,
    });

    // Create a new delivery task automatically
    const newTask = {
      id: 'task-' + Math.floor(400 + Math.random() * 600),
      donationId: don.id,
      deliveryAgentId: 'user-delivery-1',
      foodName: don.foodName,
      quantity: `${qty} ${don.unit}`,
      foodType: don.foodType,
      storageCondition: don.storageCondition,
      urgencyLevel: 'HIGH',
      pickup: {
        location: don.pickupLocation?.address || 'Donor Location',
        donorName: don.donorName,
        donorPhone: don.donorPhone || '+91 98765 43210',
        deadline: don.expiryDeadline,
      },
      dropoff: {
        location: 'Recipient Shelter Location',
        recipientName: recipientName,
        recipientPhone: '+91 91234 56789',
        deadline: don.expiryDeadline,
      },
      currentMilestone: 'ASSIGNED',
      distanceTotalKm: 3.4,
      estimatedMinutes: 20,
      qrRequiredToken: don.handoverQrToken,
      safetyChecklistCompleted: false,
      verifiedAt: null,
    };

    mockTasks.unshift(newTask);
    save(STORAGE_KEYS.TASKS, mockTasks);
    save(STORAGE_KEYS.DONATIONS, mockDonations);

    return { donation: don, task: newTask };
  },

  // ----------------------------------------------------
  // DELIVERY AGENT JOURNEY & QR VERIFICATION
  // ----------------------------------------------------
  getDeliveryTasks: async (deliveryAgentId, filter = {}) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const params = new URLSearchParams({ agentId: deliveryAgentId || '' });
        Object.entries(filter).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            params.append(k, Array.isArray(v) ? v.join(',') : v);
          }
        });
        const res = await fetch(`${API_BASE}/delivery/tasks?${params.toString()}`, {
          headers,
          credentials: 'include',
        });
        const json = await res.json();
        if (res.ok) {
          const list = Array.isArray(json) ? json : (json.data || []);
          return list.map((t) => ({
            ...t,
            id: t.id || t._id,
            priority: t.priority || 'MEDIUM',
            priorityWeight: t.priorityWeight || 2,
          }));
        }
      } catch (e) {
        console.warn('Backend tasks fetch error, using local fallback:', e);
      }
    }
    await delay(150);
    return mockTasks.map((t) => ({
      ...t,
      priority: t.priority || 'MEDIUM',
      priorityWeight: t.priorityWeight || 2,
    }));
  },


  updateDeliveryMilestone: async (taskId, nextMilestone) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/delivery/tasks/${taskId}/status`, {
          method: 'PATCH',
          headers,
          credentials: 'include',
          body: JSON.stringify({ status: nextMilestone }),
        });
        const json = await res.json();
        if (res.ok) {
          const updated = json.data || json;
          return { ...updated, id: updated.id || updated._id };
        }
      } catch (e) {
        console.warn('Backend milestone update error, using local fallback:', e);
      }
    }
    await delay(200);
    const task = mockTasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Task not found');

    task.currentMilestone = nextMilestone;
    save(STORAGE_KEYS.TASKS, mockTasks);
    return task;
  },

  claimDeliveryTask: async (taskId, agentInfo = {}) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/delivery/tasks/${taskId}/claim`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(agentInfo),
        });
        const json = await res.json();
        if (res.ok) {
          const updated = json.data || json;
          return { ...updated, id: updated.id || updated._id };
        }
      } catch (e) {
        console.warn('Backend claim task error, using local fallback:', e);
      }
    }
    await delay(150);
    const task = mockTasks.find((t) => t.id === taskId);
    if (task) {
      task.currentMilestone = 'ASSIGNED';
      task.deliveryAgentId = agentInfo.agentId || 'user-delivery-1';
      task.deliveryProvider = 'IN_HOUSE';
      save(STORAGE_KEYS.TASKS, mockTasks);
    }
    return task;
  },

  // ----------------------------------------------------
  // PORTER ENTERPRISE LOGISTICS INTEGRATION
  // ----------------------------------------------------
  getPorterEstimate: async (estimateParams) => {
    if (!USE_MOCK) {
      try {
        const res = await fetch(`${API_BASE}/porter/estimate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(estimateParams),
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend porter estimate error, using local fallback:', e);
      }
    }
    await delay(150);
    const qty = parseInt(estimateParams.quantityServings, 10) || 50;
    const distance = estimateParams.distanceKm || 4.2;
    return {
      distanceKm: distance,
      quantityServings: qty,
      recommendedVehicle: qty > 120 ? 'TATA_ACE' : qty > 30 ? '3_WHEELER' : '2_WHEELER',
      vehicles: [
        {
          vehicleType: '2_WHEELER',
          displayName: 'Porter 2-Wheeler Bike',
          icon: '🛵',
          capacityDescription: 'Up to 30 meals (15 kg)',
          estimatedFare: 65,
          etaMinutes: 8,
          isRecommended: qty <= 30,
        },
        {
          vehicleType: '3_WHEELER',
          displayName: 'Porter 3-Wheeler Cargo Auto',
          icon: '🛺',
          capacityDescription: '31 – 120 meals (60 kg)',
          estimatedFare: 155,
          etaMinutes: 12,
          isRecommended: qty > 30 && qty <= 120,
        },
        {
          vehicleType: 'TATA_ACE',
          displayName: 'Porter Tata Ace (Chota Hathi)',
          icon: '🚚',
          capacityDescription: '121 – 600 meals (350 kg)',
          estimatedFare: 310,
          etaMinutes: 18,
          isRecommended: qty > 120,
        },
      ],
      serviceProvider: 'Porter On-Demand Logistics',
      liveApiConnected: false,
    };
  },

  bookPorterDelivery: async (bookingParams) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/porter/book`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(bookingParams),
        });
        const json = await res.json();
        if (res.ok) {
          const result = json.data || json;
          if (result.task) {
            const idx = mockTasks.findIndex((t) => t.id === result.task.id || t.id === result.task._id);
            if (idx >= 0) mockTasks[idx] = result.task;
            else mockTasks.unshift(result.task);
            save(STORAGE_KEYS.TASKS, mockTasks);
          }
          return result;
        }
      } catch (e) {
        console.warn('Backend porter booking error, using local fallback:', e);
      }
    }
    await delay(300);
    const crn = `CRN-POR-${Math.floor(100000 + Math.random() * 900000)}`;
    const booking = {
      orderId: `por_sim_${Date.now()}`,
      crn,
      status: 'DRIVER_ASSIGNED',
      driverName: 'Ramesh Kumar (Porter Certified)',
      driverPhone: '+91 98450 12345',
      driverRating: 4.9,
      vehicleNumber: 'KA-01-MJ-4120',
      vehicleType: bookingParams.vehicleType || '3_WHEELER',
      fare: 155,
      etaMinutes: 10,
      trackingUrl: `https://porter.in/track/order/${crn}`,
      bookedAt: new Date().toISOString(),
      isLiveApi: false,
      message: 'Porter driver partner assigned and heading to pickup location.',
    };

    const task = mockTasks.find((t) => t.id === bookingParams.taskId || t.donationId === bookingParams.donationId);
    if (task) {
      task.deliveryProvider = 'PORTER';
      task.currentMilestone = 'EN_ROUTE_PICKUP';
      task.porterDetails = booking;
      save(STORAGE_KEYS.TASKS, mockTasks);
    }
    return { booking, task };
  },

  trackPorterDelivery: async (orderId, crn) => {
    if (!USE_MOCK) {
      try {
        const res = await fetch(`${API_BASE}/porter/track/${orderId}?crn=${crn || ''}`);
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend porter track error:', e);
      }
    }
    return {
      orderId,
      crn: crn || 'CRN-POR-98214',
      status: 'IN_TRANSIT',
      distanceRemainingKm: 2.1,
      etaMinutes: 9,
      trackingUrl: `https://porter.in/track/order/${crn || orderId}`,
    };
  },

  // ----------------------------------------------------
  // SECURE QR HANDOVER WORKFLOW (STAGES 1, 2, 3)
  // ----------------------------------------------------
  // Stage 1: Donor retrieves or generates dynamic secure Pickup QR code
  getPickupToken: async (donationId) => {
    try {
      const res = await fetch(`${API_BASE}/handover/donations/${donationId}/pickup-token`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch pickup QR code');
      return data;
    } catch (err) {
      // Local fallback
      const don = mockDonations.find((d) => d.id === donationId);
      return {
        success: true,
        token: {
          id: `tok-pk-${donationId}`,
          donationId,
          stage: 'PICKUP',
          rawToken: don?.handoverQrToken || `SAP-PK-${donationId.toUpperCase()}-SECURE`,
          tokenHash: 'sha256-mock-hash',
          expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
          status: 'ACTIVE',
        },
        donation: don || null,
      };
    }
  },

  // Stage 2: Delivery Agent scans donor's pickup QR code (Validation Step)
  verifyPickupScan: async ({ token, taskId, donationId, agentId }) => {
    try {
      const res = await fetch(`${API_BASE}/handover/verify-pickup-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, taskId, donationId, agentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Pickup QR validation failed.');
      return data;
    } catch (err) {
      if (USE_MOCK) {
        await delay(200);
        const task = mockTasks.find((t) => t.id === taskId || t.qrRequiredToken === token);
        if (!task && !token?.includes('SAP')) throw new Error('Invalid QR code.');
        return {
          success: true,
          message: 'QR verified! Complete physical inspection.',
          task: task || mockTasks[0],
          donation: mockDonations.find((d) => d.id === task?.donationId) || mockDonations[0],
        };
      }
      throw err;
    }
  },

  // Stage 2: Delivery Agent confirms physical pickup after checklist
  confirmPickup: async ({ tokenId, token, taskId, safetyChecklist, agentId, notes }) => {
    try {
      const res = await fetch(`${API_BASE}/handover/confirm-pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tokenId, token, taskId, safetyChecklist, agentId, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Pickup confirmation failed.');
      return data;
    } catch (err) {
      if (USE_MOCK) {
        await delay(300);
        const task = mockTasks.find((t) => t.id === taskId);
        if (task) task.currentMilestone = 'PICKED_UP';
        const don = mockDonations.find((d) => d.id === task?.donationId);
        if (don) don.status = 'PICKED_UP';
        save(STORAGE_KEYS.TASKS, mockTasks);
        save(STORAGE_KEYS.DONATIONS, mockDonations);
        return {
          success: true,
          task,
          donation: don,
          receiptToken: {
            id: `tok-rc-${task?.id}`,
            stage: 'RECEIPT',
            rawToken: `SAP-RC-${task?.donationId?.toUpperCase() || 'DON'}-VERIFIED`,
            expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            status: 'ACTIVE',
          },
        };
      }
      throw err;
    }
  },

  // Stage 2 / 3: Delivery Agent retrieves receipt token to present to recipient
  getReceiptToken: async (donationId) => {
    try {
      const res = await fetch(`${API_BASE}/handover/donations/${donationId}/receipt-token`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch receipt token');
      return data;
    } catch (err) {
      return {
        success: true,
        token: {
          id: `tok-rc-${donationId}`,
          donationId,
          stage: 'RECEIPT',
          rawToken: `SAP-RC-${donationId.toUpperCase()}-SECURE`,
          expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          status: 'ACTIVE',
        },
      };
    }
  },

  // Stage 3: Recipient scans delivery agent's receipt QR code (Validation Step)
  verifyReceiptScan: async ({ token, recipientId }) => {
    try {
      const res = await fetch(`${API_BASE}/handover/verify-receipt-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, recipientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Receipt QR validation failed.');
      return data;
    } catch (err) {
      if (USE_MOCK) {
        await delay(200);
        return {
          success: true,
          message: 'Receipt QR verified! Confirm food condition.',
          donation: mockDonations[0],
          task: mockTasks[0],
        };
      }
      throw err;
    }
  },

  // Stage 3: Recipient confirms actual food delivery and condition
  confirmReceipt: async ({
    tokenId,
    token,
    donationId,
    recipientId,
    recipientName,
    receivedQuantity,
    foodCondition,
    discrepancyNotes,
  }) => {
    try {
      const res = await fetch(`${API_BASE}/handover/confirm-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tokenId,
          token,
          donationId,
          recipientId,
          recipientName,
          receivedQuantity,
          foodCondition,
          discrepancyNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Receipt confirmation failed.');
      return data;
    } catch (err) {
      if (USE_MOCK) {
        await delay(300);
        const don = mockDonations.find((d) => d.id === donationId);
        if (don) don.status = 'DELIVERED';
        const task = mockTasks.find((t) => t.donationId === donationId);
        if (task) task.currentMilestone = 'DELIVERED';
        save(STORAGE_KEYS.DONATIONS, mockDonations);
        save(STORAGE_KEYS.TASKS, mockTasks);
        return {
          success: true,
          donation: don,
          task,
          receipt: {
            receiptNumber: `REC-MOCK-${donationId}`,
            donationId,
            timestamp: new Date().toISOString(),
          },
        };
      }
      throw err;
    }
  },

  // Query handover status & audit trail
  getHandoverStatus: async (donationId) => {
    try {
      const res = await fetch(`${API_BASE}/handover/status/${donationId}`, {
        credentials: 'include',
      });
      return await res.json();
    } catch (err) {
      return null;
    }
  },

  // Server-Sent Events stream subscription
  subscribeHandoverStream: (onEvent, onError) => {
    try {
      const eventSource = new EventSource(`${API_BASE}/handover/stream`, {
        withCredentials: true,
      });

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          onEvent(parsed);
        } catch (e) {
          console.error('Error parsing SSE event:', e);
        }
      };

      eventSource.onerror = (err) => {
        if (onError) onError(err);
      };

      return () => {
        eventSource.close();
      };
    } catch (e) {
      console.warn('SSE not supported or failed to initialize:', e);
      return () => {};
    }
  },

  // Legacy compatibility wrapper
  verifyHandoverQr: async ({ taskId, qrToken, safetyChecklist }) => {
    return api.confirmPickup({
      token: qrToken,
      taskId,
      safetyChecklist,
      agentId: 'user-delivery-1',
    });
  },

  // ----------------------------------------------------
  // ADMIN DASHBOARD & METRICS
  // ----------------------------------------------------
  getImpactMetrics: async () => {
    if (!USE_MOCK) {
      try {
        const res = await fetch(`${API_BASE}/dashboard/impact`);
        const json = await res.json();
        if (res.ok && json.data) {
          return {
            ...mockMetrics,
            mealsDonatedTotal: json.data.mealsSaved || mockMetrics.mealsDonatedTotal,
            activeDonationsCount: json.data.activeSurplusListings || mockMetrics.activeDonationsCount,
            rescuedPercent: json.data.completionRate || mockMetrics.rescuedPercent,
          };
        }
      } catch (e) {
        console.warn('Live impact fetch fallback:', e);
      }
    }
    await delay(100);
    return mockMetrics;
  },

  // ----------------------------------------------------
  // REVIEWS & COMMUNITY FEEDBACK
  // ----------------------------------------------------
  getReviews: async () => {
    if (!USE_MOCK) {
      try {
        const res = await fetch(`${API_BASE}/reviews`);
        if (res.ok) {
          const json = await res.json();
          const list = Array.isArray(json) ? json : (json.data || []);
          if (list.length > 0) return list.map((r) => ({ ...r, id: r.id || r._id }));
        }
      } catch (err) {
        console.warn('Live reviews fetch fallback:', err);
      }
    }
    await delay(100);
    return mockReviews;
  },

  submitReview: async (reviewData) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/reviews`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(reviewData),
        });
        if (res.ok) {
          const json = await res.json();
          const review = json.data || json;
          const mapped = { ...review, id: review.id || review._id };
          mockReviews.unshift(mapped);
          save(STORAGE_KEYS.REVIEWS, mockReviews);
          return mapped;
        }
      } catch (err) {
        console.warn('Live review submit fallback:', err);
      }
    }
    await delay(250);
    const newReview = {
      id: 'rev-' + Date.now(),
      createdAt: new Date().toISOString(),
      verifiedRescue: true,
      ...reviewData,
    };
    mockReviews.unshift(newReview);
    save(STORAGE_KEYS.REVIEWS, mockReviews);
    return newReview;
  },

  // ----------------------------------------------------
  // VERIFIED USAGE & PARTNER DIRECTORY TELEMETRY
  // ----------------------------------------------------
  getVerifiedHandovers: async () => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/admin/verified-handovers`, {
          headers,
          credentials: 'include',
        });
        if (res.ok) {
          const json = await res.json();
          const data = json.data || json;
          if (data && Array.isArray(data)) return data;
        }
      } catch (err) {
        console.warn('Live verified handovers fallback:', err);
      }
    }
    await delay(100);
    return INITIAL_VERIFIED_HANDOVERS;
  },

  getPartnersDirectory: async () => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/admin/partners`, {
          headers,
          credentials: 'include',
        });
        if (res.ok) {
          const json = await res.json();
          const data = json.data || json;
          if (data && Array.isArray(data)) return data;
        }
      } catch (err) {
        console.warn('Live partners directory fallback:', err);
      }
    }
    await delay(100);
    return INITIAL_PARTNERS_DIRECTORY;
  },

  resetDemoData: () => {
    mockUsers = INITIAL_USERS;
    mockDonations = INITIAL_DONATIONS;
    mockRequirements = INITIAL_RECIPIENT_REQUIREMENTS;
    mockTasks = INITIAL_DELIVERY_TASKS;
    mockMetrics = INITIAL_IMPACT_METRICS;
    mockReviews = INITIAL_REVIEWS;
    save(STORAGE_KEYS.USERS, INITIAL_USERS);
    save(STORAGE_KEYS.DONATIONS, INITIAL_DONATIONS);
    save(STORAGE_KEYS.REQUIREMENTS, INITIAL_RECIPIENT_REQUIREMENTS);
    save(STORAGE_KEYS.TASKS, INITIAL_DELIVERY_TASKS);
    save(STORAGE_KEYS.METRICS, INITIAL_IMPACT_METRICS);
    save(STORAGE_KEYS.REVIEWS, INITIAL_REVIEWS);
    return true;
  },

  fetchNearbyMap: async ({ lat, lng, radiusKm = 5, kind }) => {
    let url = `${API_BASE}/map/nearby?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`;
    if (kind && kind !== 'all') url += `&kind=${kind}`;
    const token = localStorage.getItem('sap_jwt_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(url, { headers, credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        return json.data || json;
      }
    } catch (err) {
      console.warn('Live map/nearby fallback:', err);
    }
    const donations = (mockDonations || []).map((d) => ({ ...d, kind: 'donation' }));
    const reqs = (mockRequirements || []).map((r) => ({ ...r, kind: 'requirement' }));
    return [...donations, ...reqs];
  },

  searchAddress: async (q) => {
    const url = `${API_BASE}/geo/search?q=${encodeURIComponent(q)}`;
    const token = localStorage.getItem('sap_jwt_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(url, { headers, credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        return json.data || json;
      }
    } catch (err) {
      console.warn('Live geo/search fallback:', err);
    }
    try {
      const osmRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=in&limit=5`
      );
      if (osmRes.ok) return await osmRes.json();
    } catch {}
    return [];
  },

  reverseGeocode: async (lat, lng) => {
    const url = `${API_BASE}/geo/reverse?lat=${lat}&lng=${lng}`;
    const token = localStorage.getItem('sap_jwt_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(url, { headers, credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        return json.data || json;
      }
    } catch (err) {
      console.warn('Live geo/reverse fallback:', err);
    }
    return { address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, city: 'Bengaluru' };
  },

  fetchRoute: async (fromLat, fromLng, toLat, toLng) => {
    const url = `${API_BASE}/geo/route?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${toLat}&toLng=${toLng}`;
    const token = localStorage.getItem('sap_jwt_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(url, { headers, credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        return json.data || json;
      }
    } catch (err) {
      console.warn('Live geo/route fallback:', err);
    }
    return { distanceKm: 5, durationMinutes: 15, estimated: true };
  },

  updateMapVisibility: async (mapVisible) => {
    const token = localStorage.getItem('sap_jwt_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/auth/me/map-visibility`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify({ mapVisible }),
    });
    const json = await res.json();
    return json.data || json;
  },

  updateAgentPreferences: async (preferences) => {
    const token = localStorage.getItem('sap_jwt_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/auth/me/agent-preferences`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify(preferences),
    });
    const json = await res.json();
    return json.data || json;
  },

  getSuggestedDeliveryFee: async (acceptanceId) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/fees/suggest?acceptanceId=${acceptanceId}`, {
          method: 'GET',
          headers,
          credentials: 'include',
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend fee suggestion error, using fallback:', e);
      }
    }
    return {
      suggestedAmount: 95,
      distanceKm: 3.5,
      baseAmount: 40,
      perKm: 12,
      maxAmount: 500,
      currency: 'INR',
    };
  },

  updateDeliveryFee: async (acceptanceId, { payerMode, amount, splitRatio, auditNote }) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/acceptances/${acceptanceId}/delivery-fee`, {
          method: 'PUT',
          headers,
          credentials: 'include',
          body: JSON.stringify({ payerMode, amount, splitRatio, auditNote }),
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend update fee error:', e);
      }
    }
    return { payerMode, amount, status: payerMode === 'NONE' ? 'AGREED' : 'PROPOSED' };
  },

  settleDeliveryFee: async (acceptanceId, { note } = {}) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/acceptances/${acceptanceId}/delivery-fee/settle`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ note }),
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend settle fee error:', e);
      }
    }
    return { settled: true, note };
  },

  // Phase 3 Matching & Allotment Services
  getMatchRecommendations: async ({ donationId, requirementId, radiusKm, priority, page, limit } = {}) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const params = new URLSearchParams();
        if (donationId) params.append('donationId', donationId);
        if (requirementId) params.append('requirementId', requirementId);
        if (radiusKm) params.append('radiusKm', radiusKm);
        if (priority) params.append('priority', priority);
        if (page) params.append('page', page);
        if (limit) params.append('limit', limit);
        const res = await fetch(`${API_BASE}/matches/recommendations?${params.toString()}`, {
          headers,
          credentials: 'include',
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend match recommendations error:', e);
      }
    }
    return { recommendations: [], total: 0, expandedRadius: false };
  },

  getSplitPlan: async (donationId, maxParts = 4) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/donations/${donationId}/split-plan?maxParts=${maxParts}`, {
          headers,
          credentials: 'include',
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend split plan error:', e);
      }
    }
    return { parts: [], totalAllocated: 0, unallocated: 0 };
  },

  confirmSplitPlan: async (donationId, parts) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/donations/${donationId}/split-plan/confirm`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ parts }),
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend confirm split error:', e);
      }
    }
    return { success: true, offersCreated: parts?.length || 0 };
  },

  updateAllotMode: async (donationId, allotMode) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/donations/${donationId}/allot-mode`, {
          method: 'PATCH',
          headers,
          credentials: 'include',
          body: JSON.stringify({ allotMode }),
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend allot mode error:', e);
      }
    }
    return { allotMode };
  },

  declineOffer: async (offerId, reason) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/matches/offers/${offerId}/decline`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ reason }),
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend decline offer error:', e);
      }
    }
    return { success: true, message: 'Offer declined' };
  },

  rejectAcceptance: async (acceptanceId, reason) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/acceptances/${acceptanceId}/reject`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ reason }),
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend reject acceptance error:', e);
      }
    }
    return { status: 'REJECTED' };
  },

  getRequirementCompletion: async (requirementId) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/requirements/${requirementId}/complete-with`, {
          headers,
          credentials: 'include',
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend complete-with error:', e);
      }
    }
    return { suggestedDonations: [], remainingGap: 0 };
  },

  // DELIVERY BATCHING & CO-ROUTING (PHASE 4)
  getAvailableBatches: async ({ vehicleType = '2_WHEELER', agentId = '' } = {}) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const params = new URLSearchParams({ vehicleType, agentId });
        const res = await fetch(`${API_BASE}/delivery/batches/available?${params.toString()}`, {
          headers,
          credentials: 'include',
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend available batches error:', e);
      }
    }
    return { proposedBatches: [], suggestedBatches: [], unbatchedOpenTaskCount: 0 };
  },

  previewBatchRoute: async ({ taskIds, vehicleType = '2_WHEELER' }) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/delivery/batches/preview`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ taskIds, vehicleType }),
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend preview batch error:', e);
      }
    }
    return null;
  },

  createDeliveryBatch: async ({ taskIds, vehicleType = '2_WHEELER' }) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/delivery/batches`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ taskIds, vehicleType }),
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
        throw new Error(json.error?.message || 'Failed to create delivery batch');
      } catch (e) {
        throw e;
      }
    }
    return null;
  },

  getDeliveryBatch: async (batchId) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/delivery/batches/${batchId}`, {
          headers,
          credentials: 'include',
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend get batch error:', e);
      }
    }
    return null;
  },

  claimDeliveryBatch: async (batchId, agentInfo = {}) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/delivery/batches/${batchId}/claim`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(agentInfo),
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
        throw new Error(json.error?.message || 'Failed to claim batch');
      } catch (e) {
        throw e;
      }
    }
    return { status: 'CLAIMED' };
  },

  releaseDeliveryBatch: async (batchId) => {
    if (!USE_MOCK) {
      try {
        const token = localStorage.getItem('sap_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/delivery/batches/${batchId}/release`, {
          method: 'POST',
          headers,
          credentials: 'include',
        });
        const json = await res.json();
        if (res.ok) return json.data || json;
      } catch (e) {
        console.warn('Backend release batch error:', e);
      }
    }
    return { status: 'CANCELLED' };
  },
};

export default api;

