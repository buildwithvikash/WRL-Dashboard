import { useMemo, useState, useEffect } from "react";
import {
  FaUsers,
  FaCheckCircle,
  FaSearch,
  FaPlusCircle,
  FaTimesCircle,
} from "react-icons/fa";
import toast from "react-hot-toast";
import axios from "axios";
import { baseURL } from "../../assets/assets";

import Button from "../ui/Button";

export default function NominationTab({ trainingId }) {
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState([]);
  const [initialSelected, setInitialSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("ALL");
  const [loading, setLoading] = useState(false);

  /* ===============================
     MANUAL EMPLOYEE
     =============================== */
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualEmployees, setManualEmployees] = useState([]);
  const [manualForm, setManualForm] = useState({
    name: "",
    employee_id: "",
    department: "Production",
  });

  /* ===============================
     FETCH EMPLOYEES
     =============================== */
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await axios.get(`${baseURL}trainings/employees`, {
          params: { department },
        });
        setEmployees(res.data.data || []);
      } catch {
        toast.error("Failed to load employees");
      }
    };

    fetchEmployees();
  }, [department]);

  useEffect(() => {
    if (!trainingId) return;

    const fetchExistingNominations = async () => {
      try {
        const res = await axios.get(
          `${baseURL}trainings/${trainingId}/nominated`
        );

        const existing = (res.data.data || []).map((n) => ({
          employee_id: n.EmployeeId,
          name: n.EmployeeName,
          department: n.Department,
          isManual: !!n.IsManual,
        }));

        setSelected(existing);
        setInitialSelected(existing); // ✅ snapshot baseline
      } catch (err) {
        toast.error("Failed to load existing nominations");
      }
    };

    fetchExistingNominations();
  }, [trainingId]);

  const hasChanges = useMemo(() => {
    if (selected.length !== initialSelected.length) return true;

    const initialIds = initialSelected.map((e) => e.employee_id).sort();
    const currentIds = selected.map((e) => e.employee_id).sort();

    return initialIds.some((id, idx) => id !== currentIds[idx]);
  }, [selected, initialSelected]);

  /* ===============================
     FILTER
     =============================== */
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      const matchesSearch =
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.employee_id.toLowerCase().includes(search.toLowerCase());

      const notSelected = !selected.some(
        (s) => s.employee_id === e.employee_id
      );

      return matchesSearch && notSelected;
    });
  }, [employees, search, selected]);

  const combinedAvailable = useMemo(() => {
    return [
      ...filteredEmployees,
      ...manualEmployees.filter(
        (e) =>
          !selected.some((s) => s.employee_id === e.employee_id) &&
          e.name.toLowerCase().includes(search.toLowerCase())
      ),
    ];
  }, [filteredEmployees, manualEmployees, search, selected]);

  /* ===============================
     TOGGLE SELECTION
     =============================== */
  const toggleEmployee = (emp) => {
    setSelected((prev) =>
      prev.some((x) => x.employee_id === emp.employee_id)
        ? prev.filter((x) => x.employee_id !== emp.employee_id)
        : [...prev, emp]
    );
  };

  /* ===============================
     CLEAR ALL
     =============================== */
  const clearAll = () => setSelected([]);

  const manualEmp = {
    employee_id: manualForm.employee_id,
    name: manualForm.name,
    department_name: manualForm.department,
    isManual: true,
  };

  /* ===============================
     SUBMIT
     =============================== */
  const handleSubmit = async () => {
    if (!trainingId) {
      toast.error("Training ID missing");
      return;
    }

    if (!selected.length) {
      toast.error("Select at least one employee");
      return;
    }

    try {
      setLoading(true);

      const payload = {
        nominations: selected.map((e) => ({
          EmployeeId: e.employee_id,
          EmployeeName: e.name,
          Department: e.department_name || e.department,
          IsManual: !!e.isManual,
        })),
      };

      await axios.post(
        `${baseURL}trainings/${trainingId}/nominations`,
        payload
      );

      toast.success("Employees nominated successfully");
      setInitialSelected(selected);
    } catch (err) {
      console.error("Nomination error:", err.response?.data || err);
      toast.error(err.response?.data?.message || "Failed to save nominations");
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     UI
     =============================== */
  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-800">
          <FaUsers className="text-blue-600" />
          Employee Nomination
        </h3>
        <p className="text-sm text-gray-500">
          Select employees who will attend this training
        </p>
      </div>

      {/* FILTER BAR */}
      <div className="flex flex-wrap gap-3 items-center justify-between bg-gray-50 p-3 rounded-lg border">
        <div className="relative w-full md:w-64">
          <FaSearch className="absolute left-3 top-2.5 text-gray-400 text-sm" />
          <input
            placeholder="Search name / code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
          />
        </div>

        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="ALL">All Departments</option>
          <option>Production</option>
          <option>Quality</option>
          <option>HR & Admin</option>
          <option>Projects & Maintenance</option>
          <option>PDC</option>
          <option>Manufacturing Engineering</option>
          <option>Supply Chain</option>
          <option>PPC</option>
          <option>Accounts & Finance</option>
          <option>Operations</option>
          <option>Civil</option>
          <option>Logistics</option>
          <option>EHS</option>
          <option>Stores</option>
          <option>Other</option>
          <option>Injection Molding</option>
        </select>

        <Button
          bgColor="bg-purple-600"
          textColor="text-white"
          className="text-sm flex items-center gap-2"
          onClick={() => setShowManualForm(true)}
        >
          <FaPlusCircle />
          Add Employee
        </Button>
      </div>

      {/* MANUAL EMPLOYEE FORM */}
      {showManualForm && (
        <div className="border rounded-lg p-4 bg-white shadow-sm space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <FaPlusCircle className="text-purple-600" />
            Add Manual Employee
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              placeholder="Employee Name *"
              value={manualForm.name}
              onChange={(e) =>
                setManualForm({ ...manualForm, name: e.target.value })
              }
              className="border px-3 py-2 text-sm rounded"
            />

            <input
              placeholder="Employee Code *"
              value={manualForm.employee_id}
              onChange={(e) =>
                setManualForm({
                  ...manualForm,
                  employee_id: e.target.value,
                })
              }
              className="border px-3 py-2 text-sm rounded"
            />

            <select
              value={manualForm.department}
              onChange={(e) =>
                setManualForm({
                  ...manualForm,
                  department: e.target.value,
                })
              }
              className="border px-3 py-2 text-sm rounded"
            >
              <option>Production</option>
              <option>Quality</option>
              <option>HR & Admin</option>
              <option>Projects & Maintenance</option>
              <option>PDC</option>
              <option>Manufacturing Engineering</option>
              <option>Supply Chain</option>
              <option>PPC</option>
              <option>Accounts & Finance</option>
              <option>Operations</option>
              <option>Civil</option>
              <option>Logistics</option>
              <option>EHS</option>
              <option>Stores</option>
              <option>Other</option>
              <option>Injection Molding</option>
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              bgColor="bg-transparent"
              textColor="text-gray-600"
              className="border text-sm"
              onClick={() => setShowManualForm(false)}
            >
              Cancel
            </Button>

            <Button
              className="text-sm"
              disabled={!manualForm.name || !manualForm.employee_id}
              onClick={() => {
                const manualEmp = {
                  employee_id: manualForm.employee_id,
                  name: manualForm.name,
                  department_name: manualForm.department,
                  isManual: true,
                };

                setManualEmployees((prev) => [...prev, manualEmp]);
                setSelected((prev) => [...prev, manualEmp]);

                setManualForm({
                  name: "",
                  employee_id: "",
                  department: "Production",
                });

                setShowManualForm(false);
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {/* AVAILABLE & SELECTED */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* AVAILABLE */}
        <div className="border rounded-lg p-4 bg-white">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-1">
              <FaUsers className="text-gray-500" />
              Available Employees
            </h4>
            <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">
              {combinedAvailable.length}
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2">
            {combinedAvailable.map((emp) => (
              <div
                key={emp.employee_id}
                onClick={() => toggleEmployee(emp)}
                className="border rounded-md p-2 cursor-pointer
                           hover:bg-blue-50 transition"
              >
                <p className="text-sm font-medium">{emp.name}</p>
                <p className="text-xs text-gray-500">
                  {emp.employee_id} • {emp.department_name || emp.department}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* SELECTED */}
        <div className="border rounded-lg p-4 bg-blue-50">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-1">
              <FaCheckCircle className="text-green-600" />
              Selected Employees
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-blue-100 px-2 py-1 rounded-full">
                {selected.length}
              </span>
              {selected.length > 0 && (
                <button onClick={clearAll} className="text-xs text-red-600">
                  Clear All
                </button>
              )}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2">
            {selected.map((emp) => (
              <div
                key={emp.employee_id}
                className="border rounded-md p-2 bg-white
               flex justify-between items-center"
              >
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    {emp.name}

                    {emp.isManual && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                        MANUAL
                      </span>
                    )}
                  </p>

                  <p className="text-xs text-gray-500">
                    {emp.employee_id} • {emp.department_name || emp.department}
                  </p>
                </div>

                <FaTimesCircle
                  className="text-red-500 cursor-pointer"
                  onClick={() => toggleEmployee(emp)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="flex justify-end">
        <Button
          disabled={!hasChanges || loading}
          onClick={handleSubmit}
          className="flex items-center gap-2"
        >
          <FaCheckCircle />
          {loading ? "Saving..." : "Save Nominations"}
        </Button>
      </div>
    </div>
  );
}
