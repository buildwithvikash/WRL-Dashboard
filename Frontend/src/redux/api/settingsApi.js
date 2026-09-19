import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const settingsApi = createApi({
  reducerPath: "settingsApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api/v1/settings",
    credentials: "include",
  }),
  tagTypes: ["MailServerConfig", "UserAccess"],
  endpoints: (builder) => ({

    // ── User Access (Super Admin) ────────────────────────────────────────────
    getUserAccessUsers: builder.query({
      query: () => "/user-access/users",
      providesTags: ["UserAccess"],
    }),

    getUserAccessRoles: builder.query({
      query: () => "/user-access/roles",
      transformResponse: (res) => res.data,
    }),

    createUser: builder.mutation({
      query: (body) => ({
        url: "/user-access/users",
        method: "POST",
        body,
      }),
      invalidatesTags: ["UserAccess"],
    }),

    updateUser: builder.mutation({
      query: ({ userCode, ...body }) => ({
        url: `/user-access/users/${userCode}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["UserAccess"],
    }),

    getUserAccessSessions: builder.query({
      query: () => "/user-access/sessions",
      providesTags: ["UserAccess"],
    }),

    getUserAccessAudit: builder.query({
      query: (params) => ({ url: "/user-access/audit", params }),
      providesTags: ["UserAccess"],
    }),

    setUserAccountStatus: builder.mutation({
      query: ({ userCode, action }) => ({
        url: `/user-access/users/${userCode}/status`,
        method: "POST",
        body: { action },
      }),
      invalidatesTags: ["UserAccess"],
    }),

    setUserLocked: builder.mutation({
      query: ({ userCode, locked }) => ({
        url: `/user-access/users/${userCode}/lock`,
        method: "POST",
        body: { locked },
      }),
      invalidatesTags: ["UserAccess"],
    }),

    forceLogoutUser: builder.mutation({
      query: (userCode) => ({
        url: `/user-access/users/${userCode}/force-logout`,
        method: "POST",
      }),
      invalidatesTags: ["UserAccess"],
    }),

    resetUserPassword: builder.mutation({
      query: ({ userCode, newPassword }) => ({
        url: `/user-access/users/${userCode}/reset-password`,
        method: "POST",
        body: newPassword ? { newPassword } : {},
      }),
      invalidatesTags: ["UserAccess"],
    }),

    forceLogoutSession: builder.mutation({
      query: (sessionId) => ({
        url: `/user-access/sessions/${sessionId}/force-logout`,
        method: "POST",
      }),
      invalidatesTags: ["UserAccess"],
    }),

    forceLogoutAllSessions: builder.mutation({
      query: () => ({
        url: "/user-access/sessions/force-logout-all",
        method: "POST",
      }),
      invalidatesTags: ["UserAccess"],
    }),

    getMailServerConfig: builder.query({
      query: () => "/mail-server",
      transformResponse: (res) => res.config,
      providesTags: ["MailServerConfig"],
    }),

    updateMailServerConfig: builder.mutation({
      query: (body) => ({
        url: "/mail-server",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["MailServerConfig"],
    }),

    resetMailServerConfig: builder.mutation({
      query: () => ({
        url: "/mail-server",
        method: "DELETE",
      }),
      invalidatesTags: ["MailServerConfig"],
    }),

    testMailServerConfig: builder.mutation({
      query: (body) => ({
        url: "/mail-server/test",
        method: "POST",
        body,
      }),
    }),

  }),
});

export const {
  useGetMailServerConfigQuery,
  useUpdateMailServerConfigMutation,
  useResetMailServerConfigMutation,
  useTestMailServerConfigMutation,
  useGetUserAccessUsersQuery,
  useGetUserAccessRolesQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useGetUserAccessSessionsQuery,
  useGetUserAccessAuditQuery,
  useSetUserAccountStatusMutation,
  useSetUserLockedMutation,
  useForceLogoutUserMutation,
  useResetUserPasswordMutation,
  useForceLogoutSessionMutation,
  useForceLogoutAllSessionsMutation,
} = settingsApi;
