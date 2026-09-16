import React, { useState, useEffect } from "react";

const STORAGE_KEY = "applications";

const STATUSES = ["Applied", "Shortlisted", "Interview", "Selected", "Rejected"];

const STATUS_STYLES = {
  Applied: { bg: "#EAEEF1", text: "#4A5C6B", border: "#5B7083" },
  Shortlisted: { bg: "#EEEAF6", text: "#4A3B7A", border: "#6C56A3" },
  Interview: { bg: "#FBF0DA", text: "#8A611C", border: "#B9832A" },
  Selected: { bg: "#E6EFE9", text: "#245A41", border: "#2F6E52" },
  Rejected: { bg: "#F4E7E4", text: "#7C3F32", border: "#A24B3E" },
};

const SOURCE_OPTIONS = [
  "Naukri",
  "LinkedIn",
  "Company Website",
  "Referral",
  "Indeed",
  "Other",
];

const DEADLINE_STYLES = {
  Overdue: { bg: "#F4E7E4", text: "#7C3F32", border: "#A24B3E" },
  "Due Today": { bg: "#FDEEDB", text: "#8A4E1C", border: "#C2793A" },
  "Due Tomorrow": { bg: "#FBF0DA", text: "#8A611C", border: "#B9832A" },
  "Due Soon": { bg: "#EAEEF1", text: "#4A5C6B", border: "#5B7083" },
};

const emptyForm = {
  company: "",
  role: "",
  location: "",
  dateApplied: "",
  deadline: "",
  stages: ["Applied"],
  currentStageIndex: 0,
  rejected: false,
  notes: "",
  resumeName: "",
  resumeLink: "",
  source: "Naukri",
  sourceOther: "",
};

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (err) {
    return false;
  }
}

function formatDate(value) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Whole-day difference between today and a "YYYY-MM-DD" deadline, ignoring time of day.
function getDaysRemaining(deadline) {
  if (!deadline) return null;
  const [y, m, d] = deadline.split("-").map(Number);
  const deadlineDate = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = deadlineDate.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function getDeadlineCategory(daysRemaining) {
  if (daysRemaining === null) return null;
  if (daysRemaining < 0) return "Overdue";
  if (daysRemaining === 0) return "Due Today";
  if (daysRemaining === 1) return "Due Tomorrow";
  if (daysRemaining <= 7) return "Due Soon";
  return null;
}

// Resolves the display label for an application's source, falling back to the
// custom text when "Other" was chosen.
function getSourceLabel(app) {
  if (!app.source) return "Not specified";
  if (app.source === "Other") return app.sourceOther ? app.sourceOther : "Other";
  return app.source;
}

// Derives one of the four dashboard/filter categories from an application's
// custom stage sequence + current position, so existing dashboard/search/filter
// logic keeps working even though stage names are now user-defined.
function getCurrentStageStatus(app) {
  if (app.rejected) return "Rejected";
  const stages = Array.isArray(app.stages) && app.stages.length > 0 ? app.stages : ["Applied"];
  const idx = Math.min(Math.max(app.currentStageIndex || 0, 0), stages.length - 1);
  const stageName = (stages[idx] || "").trim().toLowerCase();
  if (stageName === "selected") return "Selected";
  if (stageName === "shortlisted") return "Shortlisted";
  if (idx === 0) return "Applied";
  return "Interview";
}

// Ensures every application has a valid stages/currentStageIndex/rejected shape,
// migrating older records that only had a fixed `status` field.
function normalizeApplication(app) {
  if (Array.isArray(app.stages) && app.stages.length > 0) {
    const validIndex =
      typeof app.currentStageIndex === "number" &&
      app.currentStageIndex >= 0 &&
      app.currentStageIndex < app.stages.length;
    return {
      ...app,
      currentStageIndex: validIndex ? app.currentStageIndex : 0,
      rejected: !!app.rejected,
    };
  }
  const legacyStatus = app.status || "Applied";
  if (legacyStatus === "Rejected") {
    return { ...app, stages: ["Applied"], currentStageIndex: 0, rejected: true };
  }
  if (legacyStatus === "Selected") {
    return { ...app, stages: ["Applied", "Selected"], currentStageIndex: 1, rejected: false };
  }
  if (legacyStatus === "Interview") {
    return {
      ...app,
      stages: ["Applied", "Interview", "Selected"],
      currentStageIndex: 1,
      rejected: false,
    };
  }
  return {
    ...app,
    stages: ["Applied", "Interview", "Selected"],
    currentStageIndex: 0,
    rejected: false,
  };
}

export default function JobApplicationTracker() {
  const [applications, setApplications] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");

  // Load saved applications once on mount.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await Promise.resolve({ value: window.localStorage.getItem(STORAGE_KEY) });
        if (!cancelled && result && result.value) {
          const parsed = JSON.parse(result.value);
          if (Array.isArray(parsed)) {
            setApplications(parsed.map(normalizeApplication));
          }
        }
      } catch (err) {
        // No saved data yet, or storage unavailable - start empty.
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist applications any time they change, after the initial load completes.
  useEffect(() => {
    if (!isLoaded) return;
    async function save() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
      } catch (err) {
        console.error("Failed to save applications:", err);
      }
    }
    save();
  }, [applications, isLoaded]);

  function openAddForm() {
    setFormData(emptyForm);
    setErrors({});
    setEditingId(null);
    setIsFormOpen(true);
  }

  function openEditForm(app) {
    const normalized = normalizeApplication(app);
    setFormData({
      company: normalized.company || "",
      role: normalized.role || "",
      location: normalized.location || "",
      dateApplied: normalized.dateApplied || "",
      deadline: normalized.deadline || "",
      stages: normalized.stages.length > 0 ? [...normalized.stages] : ["Applied"],
      currentStageIndex: normalized.currentStageIndex || 0,
      rejected: !!normalized.rejected,
      notes: normalized.notes || "",
      resumeName: normalized.resumeName || "",
      resumeLink: normalized.resumeLink || "",
      source: normalized.source || "Naukri",
      sourceOther: normalized.sourceOther || "",
    });
    setErrors({});
    setEditingId(app.id);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setErrors({});
  }

  function validate() {
    const next = {};
    if (!formData.company.trim()) next.company = "Enter a company name";
    if (!formData.role.trim()) next.role = "Enter a role title";
    if (!formData.stages || formData.stages.length === 0) {
      next.stages = "Add at least one selection stage";
    } else if (formData.stages.some((s) => !s.trim())) {
      next.stages = "Stage names cannot be empty";
    }
    if (formData.resumeLink && formData.resumeLink.trim() && !isValidUrl(formData.resumeLink.trim())) {
      next.resumeLink = "Enter a valid URL (e.g. https://drive.google.com/...)";
    }
    if (formData.source === "Other" && !formData.sourceOther.trim()) {
      next.sourceOther = "Enter a custom source name";
    }
    return next;
  }

  function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    try {
      const validation = validate();
      if (Object.keys(validation).length > 0) {
        setErrors(validation);
        return;
      }

      const preparedData = {
        ...formData,
        stages: formData.stages.map((s) => s.trim()),
        resumeName: formData.resumeName.trim(),
        resumeLink: formData.resumeLink.trim(),
        sourceOther: formData.sourceOther.trim(),
      };

      if (editingId !== null) {
        setApplications((prev) =>
          prev.map((app) =>
            app.id === editingId ? { ...app, ...preparedData } : app
          )
        );
      } else {
        setApplications((prev) => [
          { id: Date.now(), ...preparedData },
          ...prev,
        ]);
      }
      closeForm();
    } catch (err) {
      console.error("Failed to add application:", err);
      setErrors({ general: "Something went wrong adding this application. Please try again." });
    }
  }

  function handleDelete(id) {
    setApplications((prev) => prev.filter((app) => app.id !== id));
    setConfirmDeleteId(null);
  }

  function updateField(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function updateStageName(index, value) {
    setFormData((prev) => {
      const stages = [...prev.stages];
      stages[index] = value;
      return { ...prev, stages };
    });
    if (errors.stages) {
      setErrors((prev) => ({ ...prev, stages: undefined }));
    }
  }

  function addStage() {
    setFormData((prev) => ({ ...prev, stages: [...prev.stages, ""] }));
  }

  function removeStage(index) {
    setFormData((prev) => {
      if (prev.stages.length <= 1) return prev;
      const stages = prev.stages.filter((_, i) => i !== index);
      let currentStageIndex = prev.currentStageIndex;
      if (currentStageIndex >= stages.length) {
        currentStageIndex = stages.length - 1;
      }
      return { ...prev, stages, currentStageIndex };
    });
  }

  function handleCurrentStageChange(value) {
    if (value === "__REJECTED__") {
      setFormData((prev) => ({ ...prev, rejected: true }));
    } else {
      setFormData((prev) => ({ ...prev, rejected: false, currentStageIndex: Number(value) }));
    }
  }

  function advanceStage(app) {
    setApplications((prev) =>
      prev.map((a) => {
        if (a.id !== app.id) return a;
        const normalized = normalizeApplication(a);
        if (normalized.rejected) return a;
        const nextIndex = Math.min(
          normalized.currentStageIndex + 1,
          normalized.stages.length - 1
        );
        return { ...a, stages: normalized.stages, currentStageIndex: nextIndex, rejected: false };
      })
    );
  }

  const counts = {
    total: applications.length,
    Applied: applications.filter((app) => getCurrentStageStatus(app) === "Applied").length,
    Shortlisted: applications.filter((app) => getCurrentStageStatus(app) === "Shortlisted").length,
    Interview: applications.filter((app) => getCurrentStageStatus(app) === "Interview").length,
    Selected: applications.filter((app) => getCurrentStageStatus(app) === "Selected").length,
    Rejected: applications.filter((app) => getCurrentStageStatus(app) === "Rejected").length,
  };

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredApplications = applications.filter((app) => {
    const matchesQuery =
      trimmedQuery === "" ||
      (app.company || "").toLowerCase().includes(trimmedQuery) ||
      (app.role || "").toLowerCase().includes(trimmedQuery);
    const matchesStatus = statusFilter === "All" || getCurrentStageStatus(app) === statusFilter;
    const matchesSource = sourceFilter === "All" || app.source === sourceFilter;
    return matchesQuery && matchesStatus && matchesSource;
  });
  const isFiltering = trimmedQuery !== "" || statusFilter !== "All" || sourceFilter !== "All";

  const deadlineReminders = applications
    .map((app) => {
      const normalized = normalizeApplication(app);
      const derivedStatus = getCurrentStageStatus(normalized);
      if (derivedStatus === "Selected" || derivedStatus === "Rejected") return null;
      const daysRemaining = getDaysRemaining(app.deadline);
      const category = getDeadlineCategory(daysRemaining);
      if (!category) return null;
      return { app, daysRemaining, category };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F6F4EF",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        color: "#22291F",
        padding: "0",
      }}
    >
      <style>{`
        .jat-shell {
          max-width: 1280px;
          margin: 0 auto;
          padding: 2rem 2.5rem 4rem;
          box-sizing: border-box;
        }
        @media (max-width: 1024px) {
          .jat-shell {
            padding: 1.75rem 1.5rem 3.5rem;
          }
        }
        @media (max-width: 640px) {
          .jat-shell {
            padding: 1.25rem 1rem 3rem;
          }
        }
      `}</style>
      <div className="jat-shell">
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "2rem",
            borderBottom: "1px solid #DDD8CC",
            paddingBottom: "1.25rem",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: "28px",
                fontWeight: 600,
                margin: 0,
                color: "#1B2A20",
                letterSpacing: "-0.01em",
              }}
            >
              Job Application Tracker
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: "14px", color: "#5F5E56" }}>
              {!isLoaded
                ? "Loading..."
                : applications.length === 0
                ? "No applications yet"
                : `${applications.length} application${
                    applications.length === 1 ? "" : "s"
                  } tracked`}
            </p>
          </div>
          <button
            type="button"
            onClick={openAddForm}
            style={{
              background: "#2F6E52",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 18px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            + Add application
          </button>
        </div>

        {/* Dashboard summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "10px",
            marginBottom: "1.5rem",
          }}
        >
          <SummaryCard label="Total Applications" value={counts.total} color="#1B2A20" />
          <SummaryCard
            label="Applied"
            value={counts.Applied}
            color={STATUS_STYLES.Applied.border}
          />
          <SummaryCard
            label="Shortlisted"
            value={counts.Shortlisted}
            color={STATUS_STYLES.Shortlisted.border}
          />
          <SummaryCard
            label="Interview"
            value={counts.Interview}
            color={STATUS_STYLES.Interview.border}
          />
          <SummaryCard
            label="Selected"
            value={counts.Selected}
            color={STATUS_STYLES.Selected.border}
          />
          <SummaryCard
            label="Rejected"
            value={counts.Rejected}
            color={STATUS_STYLES.Rejected.border}
          />
        </div>

        {/* Upcoming Deadlines */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h2
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: "16px",
              fontWeight: 600,
              color: "#1B2A20",
              margin: "0 0 8px",
            }}
          >
            Upcoming Deadlines
          </h2>
          {deadlineReminders.length === 0 ? (
            <div
              style={{
                border: "1px dashed #C9C3B5",
                borderRadius: "10px",
                padding: "14px 16px",
                color: "#6B6A61",
                fontSize: "13px",
              }}
            >
              No upcoming deadlines right now.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {deadlineReminders.map(({ app, daysRemaining, category }) => {
                const style = DEADLINE_STYLES[category];
                let badgeText;
                if (category === "Overdue") {
                  const overdueBy = Math.abs(daysRemaining);
                  badgeText = `Overdue · ${overdueBy} day${overdueBy === 1 ? "" : "s"}`;
                } else if (category === "Due Today") {
                  badgeText = "Due Today";
                } else if (category === "Due Tomorrow") {
                  badgeText = "Due Tomorrow";
                } else {
                  badgeText = `Due Soon · ${daysRemaining} days`;
                }
                return (
                  <div
                    key={app.id}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #E4DFD2",
                      borderLeft: `4px solid ${style.border}`,
                      borderRadius: "8px",
                      padding: "10px 14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#1B2A20" }}>
                        {app.company}{" "}
                        <span style={{ fontWeight: 400, color: "#3E4A3A" }}>· {app.role}</span>
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#8A897E" }}>
                        Deadline {formatDate(app.deadline)}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        padding: "3px 9px",
                        borderRadius: "999px",
                        background: style.bg,
                        color: style.text,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {badgeText}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Search + status filter */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginBottom: "1.5rem",
          }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by company or role..."
            style={{ ...inputStyle, flex: "2 1 280px" }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 180px" }}
          >
            <option value="All">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 180px" }}
          >
            <option value="All">All</option>
            {SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Empty state: no applications at all */}
        {isLoaded && applications.length === 0 && (
          <div
            style={{
              border: "1px dashed #C9C3B5",
              borderRadius: "12px",
              padding: "3rem 1.5rem",
              textAlign: "center",
              color: "#6B6A61",
            }}
          >
            <p style={{ margin: 0, fontSize: "15px" }}>
              Start tracking your job search by adding your first application.
            </p>
          </div>
        )}

        {/* No results for the current search/filter */}
        {isLoaded &&
          applications.length > 0 &&
          isFiltering &&
          filteredApplications.length === 0 && (
            <div
              style={{
                border: "1px dashed #C9C3B5",
                borderRadius: "12px",
                padding: "3rem 1.5rem",
                textAlign: "center",
                color: "#6B6A61",
              }}
            >
              <p style={{ margin: 0, fontSize: "15px" }}>No applications found.</p>
            </div>
          )}

        {/* List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredApplications.map((app) => {
            const normalized = normalizeApplication(app);
            const derivedStatus = getCurrentStageStatus(normalized);
            const style = STATUS_STYLES[derivedStatus];
            const isConfirming = confirmDeleteId === app.id;
            const canAdvance =
              !normalized.rejected &&
              normalized.currentStageIndex < normalized.stages.length - 1;
            return (
              <div
                key={app.id}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E4DFD2",
                  borderLeft: `4px solid ${style.border}`,
                  borderRadius: "10px",
                  padding: "16px 18px",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                      marginBottom: "4px",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "16px",
                        fontWeight: 600,
                        color: "#1B2A20",
                      }}
                    >
                      {app.company}
                    </h3>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        padding: "3px 9px",
                        borderRadius: "999px",
                        background: style.bg,
                        color: style.text,
                      }}
                    >
                      {derivedStatus}
                    </span>
                  </div>
                  <p style={{ margin: "0 0 4px", fontSize: "14px", color: "#3E4A3A" }}>
                    {app.role}
                    {app.location ? ` · ${app.location}` : ""}
                  </p>
                  {(app.dateApplied || app.deadline) && (
                    <p style={{ margin: "0 0 4px", fontSize: "13px", color: "#8A897E" }}>
                      {app.dateApplied && `Applied ${formatDate(app.dateApplied)}`}
                      {app.dateApplied && app.deadline ? "  ·  " : ""}
                      {app.deadline && `Deadline ${formatDate(app.deadline)}`}
                    </p>
                  )}

                  <p style={{ margin: "0 0 4px", fontSize: "13px", color: "#8A897E" }}>
                    Source: {getSourceLabel(app)}
                  </p>

                  <p style={{ margin: "6px 0 4px", fontSize: "13px", color: "#3E4A3A" }}>
                    <strong>Current stage:</strong>{" "}
                    {normalized.rejected
                      ? "Rejected"
                      : normalized.stages[normalized.currentStageIndex]}
                  </p>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "4px 0 8px" }}>
                    {normalized.stages.map((stageName, idx) => {
                      let bg, text, border;
                      if (normalized.rejected) {
                        bg = "#F2F0EA";
                        text = "#9C988C";
                        border = "1px solid transparent";
                      } else if (idx < normalized.currentStageIndex) {
                        bg = "#E6EFE9";
                        text = "#245A41";
                        border = "1px solid transparent";
                      } else if (idx === normalized.currentStageIndex) {
                        bg = "#FBF0DA";
                        text = "#8A611C";
                        border = "1px solid #B9832A";
                      } else {
                        bg = "#F2F0EA";
                        text = "#9C988C";
                        border = "1px solid transparent";
                      }
                      return (
                        <span
                          key={idx}
                          style={{
                            fontSize: "11px",
                            padding: "3px 8px",
                            borderRadius: "999px",
                            background: bg,
                            color: text,
                            fontWeight: idx === normalized.currentStageIndex ? 700 : 500,
                            border,
                          }}
                        >
                          {idx < normalized.currentStageIndex && !normalized.rejected ? "✓ " : ""}
                          {stageName}
                        </span>
                      );
                    })}
                    {normalized.rejected && (
                      <span
                        style={{
                          fontSize: "11px",
                          padding: "3px 8px",
                          borderRadius: "999px",
                          background: "#F4E7E4",
                          color: "#7C3F32",
                          fontWeight: 700,
                          border: "1px solid #A24B3E",
                        }}
                      >
                        Rejected
                      </span>
                    )}
                  </div>

                  {app.notes && (
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: "13px",
                        color: "#5F5E56",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {app.notes}
                    </p>
                  )}

                  {(app.resumeName || app.resumeLink) && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                        margin: "8px 0 0",
                      }}
                    >
                      {app.resumeName && (
                        <span style={{ fontSize: "13px", color: "#5F5E56" }}>
                          {app.resumeName}
                        </span>
                      )}
                      {app.resumeLink && (
                        <a
                          href={app.resumeLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "#2F6E52",
                            textDecoration: "none",
                            background: "#E6EFE9",
                            padding: "3px 9px",
                            borderRadius: "999px",
                          }}
                        >
                          📄 View Resume
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  {!isConfirming ? (
                    <>
                      {canAdvance && (
                        <button
                          onClick={() => advanceStage(app)}
                          style={secondaryBtnStyle}
                        >
                          Advance →
                        </button>
                      )}
                      <button
                        onClick={() => openEditForm(app)}
                        style={secondaryBtnStyle}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(app.id)}
                        style={dangerBtnStyle}
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: "13px", color: "#7C3F32", alignSelf: "center" }}>
                        Delete?
                      </span>
                      <button
                        onClick={() => handleDelete(app.id)}
                        style={dangerBtnStyle}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        style={secondaryBtnStyle}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Form modal */}
      {isFormOpen && (
        <div
          onClick={closeForm}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(27, 42, 32, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FFFFFF",
              borderRadius: "12px",
              padding: "1.5rem",
              width: "100%",
              maxWidth: "440px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h2
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                margin: "0 0 1.25rem",
                fontSize: "20px",
                color: "#1B2A20",
              }}
            >
              {editingId !== null ? "Edit application" : "Add application"}
            </h2>
            <form onSubmit={handleSubmit}>
              <Field label="Company" error={errors.company}>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => updateField("company", e.target.value)}
                  placeholder="e.g. Acme Corp"
                  style={inputStyle}
                />
              </Field>

              <Field label="Role" error={errors.role}>
                <input
                  type="text"
                  value={formData.role}
                  onChange={(e) => updateField("role", e.target.value)}
                  placeholder="e.g. Marketing Intern"
                  style={inputStyle}
                />
              </Field>

              <Field label="Location">
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => updateField("location", e.target.value)}
                  placeholder="e.g. Remote or Chennai, India"
                  style={inputStyle}
                />
              </Field>

              <Field label="Application Source">
                <select
                  value={formData.source}
                  onChange={(e) => updateField("source", e.target.value)}
                  style={inputStyle}
                >
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>

              {formData.source === "Other" && (
                <Field label="Custom source" error={errors.sourceOther}>
                  <input
                    type="text"
                    value={formData.sourceOther}
                    onChange={(e) => updateField("sourceOther", e.target.value)}
                    placeholder="e.g. University Job Fair"
                    style={inputStyle}
                  />
                </Field>
              )}

              <Field label="Application date">
                <input
                  type="date"
                  value={formData.dateApplied}
                  onChange={(e) => updateField("dateApplied", e.target.value)}
                  style={inputStyle}
                />
              </Field>

              <Field label="Deadline">
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => updateField("deadline", e.target.value)}
                  style={inputStyle}
                />
              </Field>

              <Field label="Selection stages" error={errors.stages}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {formData.stages.map((stageName, idx) => (
                    <div key={idx} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <span
                        style={{ fontSize: "12px", color: "#8A897E", width: "16px", flexShrink: 0 }}
                      >
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        value={stageName}
                        onChange={(e) => updateStageName(idx, e.target.value)}
                        placeholder={`Stage ${idx + 1}`}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => removeStage(idx)}
                        disabled={formData.stages.length <= 1}
                        style={{
                          ...dangerBtnStyle,
                          padding: "6px 10px",
                          opacity: formData.stages.length <= 1 ? 0.4 : 1,
                          cursor: formData.stages.length <= 1 ? "not-allowed" : "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addStage}
                    style={{ ...secondaryBtnStyle, alignSelf: "flex-start" }}
                  >
                    + Add stage
                  </button>
                </div>
              </Field>

              <Field label="Current stage">
                <select
                  value={formData.rejected ? "__REJECTED__" : String(formData.currentStageIndex)}
                  onChange={(e) => handleCurrentStageChange(e.target.value)}
                  style={inputStyle}
                >
                  {formData.stages.map((stageName, idx) => (
                    <option key={idx} value={String(idx)}>
                      {stageName || `Stage ${idx + 1}`}
                    </option>
                  ))}
                  <option value="__REJECTED__">Rejected</option>
                </select>
              </Field>

              <Field label="Notes (optional)">
                <textarea
                  value={formData.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder="Contact name, referral, link, next steps..."
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                />
              </Field>

              <Field label="Resume Name (optional)">
                <input
                  type="text"
                  value={formData.resumeName}
                  onChange={(e) => updateField("resumeName", e.target.value)}
                  placeholder="e.g. Marketing Resume - Version 2"
                  style={inputStyle}
                />
              </Field>

              <Field label="Resume Link (optional)" error={errors.resumeLink}>
                <input
                  type="text"
                  value={formData.resumeLink}
                  onChange={(e) => updateField("resumeLink", e.target.value)}
                  placeholder="e.g. https://drive.google.com/..."
                  style={inputStyle}
                />
              </Field>

              {errors.general && (
                <p style={{ margin: "0 0 1rem", fontSize: "13px", color: "#A24B3E" }}>
                  {errors.general}
                </p>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "1.5rem" }}>
                <button
                  type="button"
                  onClick={handleSubmit}
                  style={{
                    flex: 1,
                    background: "#2F6E52",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "11px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {editingId !== null ? "Save changes" : "Add application"}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  style={{
                    flex: 1,
                    background: "#F2F0E9",
                    color: "#3E4A3A",
                    border: "1px solid #DDD8CC",
                    borderRadius: "8px",
                    padding: "11px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E4DFD2",
        borderTop: `3px solid ${color}`,
        borderRadius: "10px",
        padding: "12px 14px",
      }}
    >
      <p
        style={{
          margin: "0 0 4px",
          fontSize: "12px",
          fontWeight: 600,
          color: "#6B6A61",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {label}
      </p>
      <p style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#1B2A20" }}>
        {value}
      </p>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label
        style={{
          display: "block",
          fontSize: "13px",
          fontWeight: 600,
          color: "#3E4A3A",
          marginBottom: "6px",
        }}
      >
        {label}
      </label>
      {children}
      {error && (
        <p style={{ margin: "5px 0 0", fontSize: "12px", color: "#A24B3E" }}>
          {error}
        </p>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  fontSize: "14px",
  border: "1px solid #DDD8CC",
  borderRadius: "8px",
  outline: "none",
  color: "#22291F",
  background: "#FCFBF8",
};

const secondaryBtnStyle = {
  background: "#F2F0E9",
  color: "#3E4A3A",
  border: "1px solid #DDD8CC",
  borderRadius: "6px",
  padding: "6px 12px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const dangerBtnStyle = {
  background: "#F4E7E4",
  color: "#7C3F32",
  border: "1px solid #E0C4BC",
  borderRadius: "6px",
  padding: "6px 12px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};
