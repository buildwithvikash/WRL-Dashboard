import { useState, useEffect } from "react";
import {
  FaUserCheck,
  FaUserTimes,
  FaUsers,
  FaCheckCircle,
  FaPlusCircle,
} from "react-icons/fa";
import axios from "axios";
import toast from "react-hot-toast";

import Button from "../ui/Button";
import { exportToXls } from "../../utils/exportToXls";
import { baseURL } from "../../assets/assets";

export default function AttendanceTab({ trainingId, onAttendanceCompleted }) {
  /* =============================== */
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [attendanceStarted, setAttendanceStarted] = useState(true);
  const [attendanceLocked, setAttendanceLocked] = useState(false);

  /* =============================== */
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmp, setNewEmp] = useState({
    name: "",
    id: "",
    department: "Production",
    phone: "",
    email: "",
  });

  /* =============================== LOAD NOMINATED EMPLOYEES =============================== */
  useEffect(() => {
    if (!trainingId) return;

    axios
      .get(`${baseURL}trainings/${trainingId}/nominated`)
      .then((res) => {
        const data = res.data.data || [];
        setEmployees(
          data.map((e) => ({
            id: e.EmployeeId,
            name: e.EmployeeName,
            department: e.Department,
            isManual: !!e.IsManual,
          }))
        );
      })
      .catch(() => toast.error("Failed to load nominated employees"));
  }, [trainingId]);

  /* =============================== LOAD EXISTING ATTENDANCE =============================== */
  useEffect(() => {
    if (!trainingId) return;

    axios
      .get(`${baseURL}trainings/${trainingId}/attendance`)
      .then((res) => {
        const rows = res.data?.data || [];
        if (rows.length > 0) {
          const map = {};
          rows.forEach((r) => {
            map[r.EmployeeId] = r.Status;
          });
          setAttendance(map);
          setAttendanceLocked(true); // 🔒 lock if already saved
        }
      })
      .catch(() => {});
  }, [trainingId]);

  /* =============================== ATTENDANCE HANDLERS =============================== */
  const markPresent = (id) => {
    if (attendanceLocked) return;
    setAttendance((p) => ({ ...p, [id]: "PRESENT" }));
  };

  const markAbsent = (id) => {
    if (attendanceLocked) return;
    setAttendance((p) => ({ ...p, [id]: "ABSENT" }));
  };

  const presentCount = Object.values(attendance).filter(
    (v) => v === "PRESENT"
  ).length;

  const absentCount = Object.values(attendance).filter(
    (v) => v === "ABSENT"
  ).length;

  /* =============================== SAVE TO BACKEND =============================== */
  const handleSaveAttendance = async () => {
    try {
      const payload = {
        attendance: employees.map((emp) => ({
          EmployeeId: emp.id,
          EmployeeName: emp.name,
          Department: emp.department,
          Status: attendance[emp.id] || "ABSENT",
          IsManual: emp.isManual,
        })),
      };

      await axios.post(
        `${baseURL}trainings/${trainingId}/attendance`,
        payload
      );

      toast.success("Attendance saved");
      setAttendanceLocked(true);
      onAttendanceCompleted?.();
    } catch (err) {
      toast.error("Failed to save attendance");
      console.error(err);
    }
  };

  /* =============================== EXPORT =============================== */
  const handleExportAttendance = () => {
    const exportData = employees.map((emp) => ({
      "Training ID": trainingId,
      "Employee ID": emp.id,
      "Employee Name": emp.name,
      Department: emp.department,
      Status: attendance[emp.id] || "NOT MARKED",
      "Marked On": new Date().toLocaleString(),
    }));

    exportToXls(exportData, `Training_Attendance_${trainingId}.xlsx`);
  };

  /* =============================== ADD MANUAL EMPLOYEE =============================== */
  const addEmployee = () => {
    setEmployees((prev) => [
      ...prev,
      {
        id: newEmp.id,
        name: newEmp.name,
        department: newEmp.department,
        isManual: true,
      },
    ]);

    setNewEmp({
      name: "",
      id: "",
      department: "Production",
      phone: "",
      email: "",
    });

    setShowAddForm(false);
  };

  /* =============================== UI =============================== */
  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="border rounded-xl p-4 bg-white flex justify-between">
        <h3 className="font-semibold text-lg">Training Attendance</h3>

        <Button
          bgColor="bg-transparent"
          textColor="text-blue-600"
          className="border text-xs"
          disabled={attendanceLocked}
          onClick={() => setShowAddForm(true)}
        >
          <FaPlusCircle className="mr-1" />
          Add Employee
        </Button>
      </div>

      {/* ADD EMPLOYEE */}
      {showAddForm && !attendanceLocked && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              placeholder="Employee Name"
              value={newEmp.name}
              onChange={(e) =>
                setNewEmp({ ...newEmp, name: e.target.value })
              }
              className="border px-3 py-1.5 text-xs rounded"
            />

            <input
              placeholder="Employee Code"
              value={newEmp.id}
              onChange={(e) => setNewEmp({ ...newEmp, id: e.target.value })}
              className="border px-3 py-1.5 text-xs rounded"
            />

            <select
              value={newEmp.department}
              onChange={(e) =>
                setNewEmp({ ...newEmp, department: e.target.value })
              }
              className="border px-3 py-1.5 text-xs rounded"
            >
              <option>Production</option>
              <option>Quality</option>
              <option>HR</option>
              <option>Maintenance</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <Button
              bgColor="bg-transparent"
              className="border text-xs"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </Button>

            <Button
              className="text-xs"
              disabled={!newEmp.name || !newEmp.id}
              onClick={addEmployee}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {/* SUMMARY */}
      <div className="flex gap-6 border rounded-xl p-4 bg-gray-50">
        <div className="flex gap-2 items-center text-sm">
          <FaUsers /> Total: <b>{employees.length}</b>
        </div>
        <div className="flex gap-2 items-center text-sm text-green-600">
          <FaUserCheck /> Present: <b>{presentCount}</b>
        </div>
        <div className="flex gap-2 items-center text-sm text-red-600">
          <FaUserTimes /> Absent: <b>{absentCount}</b>
        </div>
      </div>

      {/* LIST */}
      <div className="border rounded-xl divide-y bg-white">
        {employees.map((emp) => {
          const status = attendance[emp.id];

          return (
            <div
              key={emp.id}
              className="flex justify-between items-center p-4"
            >
              <div>
                <p className="font-medium">
                  {emp.name}
                  {emp.isManual && (
                    <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                      MANUAL
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {emp.id} | {emp.department}
                </p>
              </div>

              <div className="flex gap-2">
                {status === "PRESENT" && (
                  <span className="text-green-600 flex items-center gap-1">
                    <FaCheckCircle /> Present
                  </span>
                )}

                {status === "ABSENT" && (
                  <span className="text-red-600">Absent</span>
                )}

                {!status && (
                  <>
                    <Button
                      bgColor="bg-transparent"
                      textColor="text-green-600"
                      padding="p-2"
                      disabled={attendanceLocked}
                      onClick={() => markPresent(emp.id)}
                    >
                      <FaUserCheck />
                    </Button>

                    <Button
                      bgColor="bg-transparent"
                      textColor="text-red-600"
                      padding="p-2"
                      disabled={attendanceLocked}
                      onClick={() => markAbsent(emp.id)}
                    >
                      <FaUserTimes />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* FOOTER */}
      <div className="flex justify-end gap-3">
        <Button onClick={handleExportAttendance}>Export</Button>

        <Button disabled={attendanceLocked} onClick={handleSaveAttendance}>
          Save Attendance
        </Button>
      </div>
    </div>
  );
}
