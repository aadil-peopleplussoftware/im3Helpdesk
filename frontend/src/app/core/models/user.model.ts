export interface UserModel {
  id: string;
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  department?: string | null;
  location?: string | null;
  designation?: string | null;
  dateOfBirth?: string | null;
  dateOfJoining?: string | null;
  gender?: string | null;
  photoUrl?: string | null;
  userName?: string;
  role?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface UpdateProfileRequest {
  fullName: string;
  phoneNumber?: string | null;
  department?: string | null;
  location?: string | null;
  designation?: string | null;
  dateOfBirth?: string | null;
  dateOfJoining?: string | null;
  gender?: string | null;
}
