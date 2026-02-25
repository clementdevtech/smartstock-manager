import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { createUser, getUsers, resetUserPassword } from "../../services/admin";

export default function UserManagement() {
  const { register, handleSubmit, reset } = useForm();
  const [users, setUsers] = useState([]);
  const [passwords, setPasswords] = useState({});

  const load = async () => {
    const res = await getUsers();
    setUsers(Array.isArray(res) ? res : res?.users ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (data) => {
    await createUser(data);
    reset();
    load();
  };

  return (
    <div className="space-y-6">

      {/* CREATE USER */}
      <div className="border p-4 rounded">
        <h2 className="font-semibold mb-2">Register User</h2>

        <form
          onSubmit={handleSubmit(onCreate)}
          className="grid grid-cols-2 gap-3"
        >
          <input {...register("email")} placeholder="Email" required />
          <input type="password" {...register("password")} placeholder="Password" required />
          <input {...register("storeName")} placeholder="Store Name" />
          <input {...register("phone")} placeholder="Phone" />
          <input {...register("country")} placeholder="Country" />

          <button className="col-span-2 bg-emerald-600 text-white p-2 rounded">
            Create User
          </button>
        </form>
      </div>

      {/* USERS */}
      <div className="border p-4 rounded">
        <h2 className="font-semibold mb-2">Users</h2>

        {users.map((u) => (
          <div key={u.email} className="flex gap-2 items-center mb-2">
            <div className="flex-1">{u.email}</div>

            <input
              type="password"
              placeholder="New password"
              onChange={(e) =>
                setPasswords((p) => ({ ...p, [u.email]: e.target.value }))
              }
            />

            <button
              onClick={() => resetUserPassword(u.email, passwords[u.email])}
              className="bg-blue-600 text-white px-3 py-1 rounded"
            >
              Update
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}