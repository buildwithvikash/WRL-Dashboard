import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const permissionApi = createApi({
  reducerPath: "permissionApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api/v1",
    credentials: "include",
  }),
  tagTypes: ["Permissions", "HiddenPages"],
  endpoints: (builder) => ({

    getMyPermissions: builder.query({
      query: () => "/permission/me",
      providesTags: ["Permissions"],
    }),

    getHiddenPages: builder.query({
      query: () => "/permission/hidden-pages",
      transformResponse: (res) => res.data ?? [],
      providesTags: ["HiddenPages"],
    }),

    setPageHidden: builder.mutation({
      query: (body) => ({ url: "/permission/hidden-pages", method: "PUT", body }),
      invalidatesTags: ["HiddenPages", "Permissions"],
    }),

    updateRolePermissions: builder.mutation({
      query: (body) => ({
        url: "/permission/admin/update",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Permissions"],
    }),

  }),
});

export const {
  useGetMyPermissionsQuery,
  useUpdateRolePermissionsMutation,
  useGetHiddenPagesQuery,
  useSetPageHiddenMutation,
} = permissionApi;