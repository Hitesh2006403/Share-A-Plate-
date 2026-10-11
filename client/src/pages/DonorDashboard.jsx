import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDonations } from '../context/DonationContext';
import { DonationCard } from '../components/donor/DonationCard';
import { CreateDonationModal } from '../components/donor/CreateDonationModal';
import { ReopenModal } from '../components/donor/ReopenModal';
import { QrCodeModal } from '../components/common/QrCodeModal';
import SplitPlanModal from '../features/matching/SplitPlanModal';
import { SpatialImpactHUD, SpatialCard } from '../features/spatial';
import {
  UtensilsCrossed,
  PlusCircle,
  Filter,
  Sparkles,
  HeartHandshake,
  CheckCircle2,
  Clock,
  Search,
  X,
  Star,
  Flame,
  ArrowUpDown,
} from 'lucide-react';

export const DonorDashboard = ({ isCreateOpen, setIsCreateOpen }) => {
  const { currentUser } = useAuth();
  const { donations, loading } = useDonations();
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriorities, setSelectedPriorities] = useState([]);
  const [sortOption, setSortOption] = useState('expiry_asc');
  const [selectedDonationForQr, setSelectedDonationForQr] = useState(null);
  const [selectedDonationForReopen, setSelectedDonationForReopen] = useState(null);
  const [editingDonation, setEditingDonation] = useState(null);
  const [splitDonation, setSplitDonation] = useState(null);

  const donorDonations = donations;

  // Counts per priority for current donor
  const countsPerPriority = {
    LOW: donorDonations.filter((d) => (d.priority || 'MEDIUM') === 'LOW').length,
    MEDIUM: donorDonations.filter((d) => (d.priority || 'MEDIUM') === 'MEDIUM').length,
    HIGH: donorDonations.filter((d) => (d.priority || 'MEDIUM') === 'HIGH').length,
  };

  const togglePriorityFilter = (val) => {
    setSelectedPriorities((prev) =>
      prev.includes(val) ? prev.filter((p) => p !== val) : [...prev, val]
    );
  };

  const filtered = donorDonations.filter((d) => {
    // Venue / Category filter: HOTELS, Resturant, Event venue, Others
    let matchesTab = true;
    const venueText = `${d.donorName || ''} ${d.foodName || ''} ${d.pickupLocation?.address || ''}`.toLowerCase();

    if (activeTab === 'HOTELS') {
      matchesTab =
        d.venueType === 'HOTELS' ||
        /hotel|hyatt|sheraton|marriott|taj|resort|radisson|hilton/i.test(venueText);
    } else if (activeTab === 'Resturant') {
      matchesTab =
        d.venueType === 'Resturant' ||
        /restaurant|resturant|bistro|bakery|cafe|kitchen|diner|grill/i.test(venueText);
    } else if (activeTab === 'Event venue') {
      matchesTab =
        d.venueType === 'Event venue' ||
        /event|venue|banquet|catering|hall|convention|wedding|pavilion|grounds/i.test(venueText);
    } else if (activeTab === 'Others') {
      matchesTab =
        d.venueType === 'Others' ||
        /court|campus|hostel|mess|supermarket|market/i.test(venueText) ||
        (!/hotel|hyatt|sheraton/i.test(venueText) &&
          !/restaurant|bistro|bakery|grill/i.test(venueText) &&
          !/convention|wedding|pavilion/i.test(venueText));
    }

    // Priority filter (multi-select)
    const itemPriority = d.priority || 'MEDIUM';
    const matchesPriority =
      selectedPriorities.length === 0 || selectedPriorities.includes(itemPriority);

    // Search query filter
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      d.foodName.toLowerCase().includes(q) ||
      d.donorName.toLowerCase().includes(q) ||
      (d.dietaryCategory && d.dietaryCategory.toLowerCase().includes(q)) ||
      (d.pickupLocation?.address && d.pickupLocation.address.toLowerCase().includes(q));

    return matchesTab && matchesPriority && matchesSearch;
  });

  // Sorting: numeric priority weight or expiry countdown
  const sorted = [...filtered].sort((a, b) => {
    const weightA = a.priorityWeight || (a.priority === 'HIGH' ? 3 : a.priority === 'LOW' ? 1 : 2);
    const weightB = b.priorityWeight || (b.priority === 'HIGH' ? 3 : b.priority === 'LOW' ? 1 : 2);

    if (sortOption === 'priority_desc') {
      if (weightB !== weightA) return weightB - weightA;
      return new Date(a.expiryDeadline || 0) - new Date(b.expiryDeadline || 0);
    }
    if (sortOption === 'priority_asc') {
      if (weightA !== weightB) return weightA - weightB;
      return new Date(a.expiryDeadline || 0) - new Date(b.expiryDeadline || 0);
    }
    if (sortOption === 'newest') {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    }
    // Default: soonest effective expiry first, then HIGH priority
    const expiryDiff = new Date(a.expiryDeadline || 0) - new Date(b.expiryDeadline || 0);
    if (expiryDiff !== 0) return expiryDiff;
    return weightB - weightA;
  });

  const activeCount = donorDonations.filter(
    (d) => d.status === 'AVAILABLE' || d.status === 'PARTIALLY_ACCEPTED' || d.status === 'REOPENED'
  ).length;

  return (
    <div className="space-y-8">
      {/* Top Hero Banner */}
      <div className="bg-gradient-to-r from-rose-900 via-rose-800 to-amber-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-lg">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-1.5 bg-white/15 px-3 py-1 rounded-full text-xs font-semibold text-amber-200">
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Donor Hub • {currentUser?.organizationName || 'Kitchen Operations'}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Rescue Surplus Food Before It Expires
          </h2>
          <p className="text-sm text-rose-100/90 leading-relaxed">
            Every minute counts. Post excess buffet meals, bakery goods, and groceries with live expiry countdowns and user-chosen priority routing.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setEditingDonation(null);
                setIsCreateOpen(true);
              }}
              className="bg-white hover:bg-amber-50 active:scale-95 text-rose-800 font-bold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-md transition flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4 text-rose-600" />
              <span>Post Food Surplus Now</span>
            </button>
            <div className="flex items-center gap-2 text-xs text-rose-100 font-medium flex-wrap">
              <span className="bg-white/10 px-2.5 py-1 rounded-lg">
                ⚡ {activeCount} Active
              </span>
              <span className="bg-rose-500/20 text-rose-200 px-2.5 py-1 rounded-lg border border-rose-400/30">
                🔴 {countsPerPriority.HIGH} High
              </span>
              <span className="bg-amber-500/20 text-amber-200 px-2.5 py-1 rounded-lg border border-amber-400/30">
                🟡 {countsPerPriority.MEDIUM} Med
              </span>
              <span className="bg-emerald-500/20 text-emerald-200 px-2.5 py-1 rounded-lg border border-emerald-400/30">
                🟢 {countsPerPriority.LOW} Low
              </span>
            </div>
          </div>
        </div>

        {/* Ambient Decorative Shapes */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-amber-500/20 to-transparent pointer-events-none" />
      </div>

      {/* PHASE 5: SPATIAL 3D IMPACT TELEMETRY HUD */}
      <SpatialImpactHUD />

      {/* PROMINENT SEARCH BAR & FILTERS */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Real-time Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search donations by food name, location, dietary category..."
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-rose-500"
              >
                <option value="expiry_asc">Sort: Expiring soonest</option>
                <option value="priority_desc">Sort: Priority (High to Low)</option>
                <option value="priority_asc">Sort: Priority (Low to High)</option>
                <option value="newest">Sort: Newest first</option>
              </select>
            </div>

            <div className="text-xs text-slate-500 font-medium shrink-0">
              Showing {sorted.length} batch(es)
            </div>
          </div>
        </div>

        {/* Priority Filter Chips (Multi-Select) & Category Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">
              Priority:
            </span>
            {[
              { id: 'HIGH', label: 'High Priority', color: 'border-rose-300 text-rose-700 bg-rose-50', active: 'bg-rose-600 text-white border-rose-600' },
              { id: 'MEDIUM', label: 'Medium', color: 'border-amber-300 text-amber-700 bg-amber-50', active: 'bg-amber-600 text-white border-amber-600' },
              { id: 'LOW', label: 'Low', color: 'border-emerald-300 text-emerald-700 bg-emerald-50', active: 'bg-emerald-600 text-white border-emerald-600' },
            ].map((chip) => {
              const isSelected = selectedPriorities.includes(chip.id);
              return (
                <button
                  key={chip.id}
                  onClick={() => togglePriorityFilter(chip.id)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition whitespace-nowrap ${
                    isSelected ? chip.active : chip.color
                  }`}
                >
                  {isSelected ? '✓ ' : ''}{chip.label} ({countsPerPriority[chip.id] || 0})
                </button>
              );
            })}
            {selectedPriorities.length > 0 && (
              <button
                onClick={() => setSelectedPriorities([])}
                className="text-[11px] text-slate-400 hover:text-slate-600 underline ml-1"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Tabs: HOTELS, Resturant, Event venue, Others */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'ALL', label: 'All Venues' },
              { id: 'HOTELS', label: 'HOTELS' },
              { id: 'Resturant', label: 'Resturant' },
              { id: 'Event venue', label: 'Event venue' },
              { id: 'Others', label: 'Others' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(activeTab === tab.id && tab.id !== 'ALL' ? 'ALL' : tab.id)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Donation Grid */}
      {sorted.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-slate-800">No donations found</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || selectedPriorities.length > 0
              ? 'No surplus food matched your current filter criteria. Try clearing filters.'
              : 'Post surplus food items to connect directly with orphanages and community kitchens.'}
          </p>
          {searchQuery || selectedPriorities.length > 0 ? (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedPriorities([]);
                setActiveTab('ALL');
              }}
              className="inline-flex items-center gap-1.5 bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-700 transition"
            >
              <span>Reset Filters</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setEditingDonation(null);
                setIsCreateOpen(true);
              }}
              className="inline-flex items-center gap-1.5 bg-rose-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-rose-500 transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create First Surplus Post</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sorted.map((donation) => (
            <SpatialCard key={donation.id} maxTilt={6}>
              <DonationCard
                donation={donation}
                onShowQr={(don) => setSelectedDonationForQr(don)}
                onReopen={(don) => setSelectedDonationForReopen(don)}
                onSplit={(don) => setSplitDonation(don)}
                onEdit={(don) => {
                  setEditingDonation(don);
                  setIsCreateOpen(true);
                }}
              />
            </SpatialCard>
          ))}
        </div>
      )}


      {/* Modals */}
      <CreateDonationModal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setEditingDonation(null);
        }}
        donationToEdit={editingDonation}
      />

      <QrCodeModal
        isOpen={!!selectedDonationForQr}
        onClose={() => setSelectedDonationForQr(null)}
        donation={selectedDonationForQr}
      />

      <ReopenModal
        isOpen={!!selectedDonationForReopen}
        onClose={() => setSelectedDonationForReopen(null)}
        donation={selectedDonationForReopen}
      />

      <SplitPlanModal
        isOpen={!!splitDonation}
        onClose={() => setSplitDonation(null)}
        donation={splitDonation}
        onPlanConfirmed={() => setSplitDonation(null)}
      />
    </div>
  );
};
