import { useState, useEffect } from "react";
import {
  FaTimes,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaExclamationCircle,
  FaBookOpen,
  FaUsers,
  FaSave,
  FaPlusCircle,
} from "react-icons/fa";
import toast from "react-hot-toast";
import axios from "axios";
import { baseURL } from "../../assets/assets";

import Button from "../../components/ui/Button";
import SelectField from "../../components/ui/SelectField";
import InputField from "../../components/ui/InputField";
import DateTimePicker from "../../components/ui/DateTimePicker";

/**
 * Props:
 * - onClose()
 * - onCreate(payload)
 */
export default function CreateTrainingModal({
  onClose,
  onCreate,
  onUpdate,
  editData,
}) {
  const [form, setForm] = useState({
    TrainingTitle: "",
    TrainingType: "",
    TrainerType: "INTERNAL",
    TrainerEmployeeId: "",
    ExternalTrainerName: "",
    Mode: "OFFLINE",
    LocationDetails: "",
    StartDateTime: "",
    EndDateTime: "",
    Mandatory: false,
  });

  const [errors, setErrors] = useState({});
  const [internalTrainers, setInternalTrainers] = useState([]);

  /* ================= KEEPING YOUR TRAINER FETCH ================= */
  useEffect(() => {
    axios
      .get(`${baseURL}trainings/internal-trainers`)
      .then((res) => setInternalTrainers(res.data.data || []))
      .catch(() => toast.error("Failed to load internal trainers"));
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  useEffect(() => {
    if (!editData) return;

    setForm({
      TrainingTitle: editData.TrainingTitle || "",
      TrainingType: editData.TrainingType || "",
      TrainerType: editData.TrainerType || "INTERNAL",
      TrainerEmployeeId: editData.TrainerEmployeeId || "",
      ExternalTrainerName: editData.ExternalTrainerName || "",
      Mode: editData.Mode || "OFFLINE",
      LocationDetails: editData.LocationDetails || "",
      StartDateTime: editData.StartDateTime || "",
      EndDateTime: editData.EndDateTime || "",
      Mandatory: !!editData.Mandatory,
    });
  }, [editData]);

  /* ================= HANDLERS ================= */
  const handleChange = (name, value) => {
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /* ================= VALIDATION ================= */
  const validate = () => {
    const e = {};

    if (!form.TrainingTitle) e.TrainingTitle = "Training title is required";
    if (!form.TrainingType) e.TrainingType = "Training type is required";
    if (!form.StartDateTime) e.StartDateTime = "Start date & time required";
    if (!form.EndDateTime) e.EndDateTime = "End date & time required";

    if (
      form.StartDateTime &&
      form.EndDateTime &&
      new Date(form.EndDateTime) <= new Date(form.StartDateTime)
    ) {
      e.EndDateTime = "End time must be after start time";
    }

    if (form.TrainerType === "INTERNAL" && !form.TrainerEmployeeId) {
      e.TrainerEmployeeId = "Select internal trainer";
    }

    if (form.TrainerType === "EXTERNAL" && !form.ExternalTrainerName) {
      e.ExternalTrainerName = "External trainer name required";
    }

    return e;
  };

  /* ================= SUBMIT ================= */
  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }

    if (editData) {
      onUpdate(form, editData.ID);
    } else {
      onCreate(form);
    }
  };

  /* ================= UI ================= */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl w-full max-w-3xl shadow-xl
                  max-h-[90vh] flex flex-col"
      >
        {/* HEADER */}
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FaBookOpen className="text-blue-600" />
            <h2 className="text-lg font-semibold">
              {editData ? "Edit Training Program" : "Create Training Program"}
            </h2>
          </div>
          <button onClick={onClose}>
            <FaTimes className="text-gray-400 hover:text-red-600" />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* TRAINING DETAILS */}
          <Section title="Training Details" icon={<FaBookOpen />}>
            <InputField
              label="Training Title *"
              value={form.TrainingTitle}
              onChange={(e) => handleChange("TrainingTitle", e.target.value)}
            />
            {errors.TrainingTitle && <Error text={errors.TrainingTitle} />}

            <InputField
              label="Training Type *"
              value={form.TrainingType}
              onChange={(e) => handleChange("TrainingType", e.target.value)}
            />
            {errors.TrainingType && <Error text={errors.TrainingType} />}
          </Section>

          {/* TRAINER */}
          <Section title="Trainer Information" icon={<FaUsers />}>
            <div className="flex gap-3">
              {["INTERNAL", "EXTERNAL"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      TrainerType: t,
                      TrainerEmployeeId: "",
                      ExternalTrainerName: "",
                    })
                  }
                  className={`px-4 py-2 rounded-lg text-sm border
                    ${
                      form.TrainerType === t
                        ? "bg-indigo-600 text-white"
                        : "bg-white hover:bg-gray-100"
                    }`}
                >
                  {t === "INTERNAL" ? "Internal Trainer" : "External Trainer"}
                </button>
              ))}
            </div>

            {form.TrainerType === "INTERNAL" && (
              <>
                <SelectField
                  label="Select Trainer *"
                  name="TrainerEmployeeId"
                  value={form.TrainerEmployeeId}
                  options={internalTrainers.map((u) => ({
                    value: u.employee_id,
                    label: `${u.name} (${u.employee_id})`,
                  }))}
                  onChange={(e) => {
                    const u = internalTrainers.find(
                      (x) => x.employee_id === e.target.value
                    );
                    setForm({
                      ...form,
                      TrainerEmployeeId: u.employee_id,
                      ExternalTrainerName: u.name,
                    });
                  }}
                />
                {errors.TrainerEmployeeId && (
                  <Error text={errors.TrainerEmployeeId} />
                )}
              </>
            )}

            {form.TrainerType === "EXTERNAL" && (
              <>
                <InputField
                  label="External Trainer / Agency *"
                  value={form.ExternalTrainerName}
                  onChange={(e) =>
                    handleChange("ExternalTrainerName", e.target.value)
                  }
                />
                {errors.ExternalTrainerName && (
                  <Error text={errors.ExternalTrainerName} />
                )}
              </>
            )}
          </Section>

          {/* SCHEDULE */}
          <Section title="Schedule & Mode" icon={<FaCalendarAlt />}>
            <DateTimePicker
              label="Start Time"
              name="startTime"
              value={form.StartDateTime}
              onChange={(e) => handleChange("StartDateTime", e.target.value)}
            />
            {errors.StartDateTime && <Error text={errors.StartDateTime} />}

            <DateTimePicker
              label="End Time"
              name="endTime"
              value={form.EndDateTime}
              onChange={(e) => handleChange("EndDateTime", e.target.value)}
            />
            {errors.EndDateTime && <Error text={errors.EndDateTime} />}

            <SelectField
              label="Training Mode"
              name="Mode"
              value={form.Mode}
              options={[
                { value: "OFFLINE", label: "Offline" },
                { value: "ONLINE", label: "Online" },
                { value: "HYBRID", label: "Hybrid" },
              ]}
              onChange={(e) => handleChange("Mode", e.target.value)}
            />

            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={form.Mandatory}
                onChange={(e) => handleChange("Mandatory", e.target.checked)}
                className="accent-red-600"
              />
              <span className="text-sm flex items-center gap-1 text-red-600">
                <FaExclamationCircle /> Mandatory Training
              </span>
            </div>
          </Section>

          {/* LOCATION */}
          <Section title="Location" icon={<FaMapMarkerAlt />}>
            <InputField
              label="Location / Online Link"
              value={form.LocationDetails}
              onChange={(e) => handleChange("LocationDetails", e.target.value)}
            />
          </Section>
        </div>

        {/* FOOTER */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <Button
            bgColor="bg-white"
            textColor="text-gray-600"
            className="border"
            onClick={onClose}
          >
            Cancel
          </Button>

          <Button onClick={handleSubmit} className="flex items-center gap-2">
            {editData ? <FaSave /> : <FaPlusCircle />}
            {editData ? "Update Training" : "Create Training"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ================= HELPERS ================= */

function Section({ title, icon, children }) {
  return (
    <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Error({ text }) {
  return <p className="text-xs text-red-600 -mt-1">{text}</p>;
}
