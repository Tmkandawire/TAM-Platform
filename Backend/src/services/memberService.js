import Profile from "../models/Profile.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";

class MemberService {
  /**
   * @desc    Create or initialize a member profile
   * @param   {Object} profileData - Validated data from memberDto
   * @param   {String} userId - The authenticated user ID
   */
  async createProfile(profileData, userId) {
    // 1. Check if profile already exists
    const existingProfile = await Profile.findOne({ user: userId });
    if (existingProfile) {
      throw new ApiError(400, "Profile already exists for this user");
    }

    // 2. Create the profile
    const profile = await Profile.create({
      ...profileData,
      user: userId,
    });

    // 3. Link the profile back to the User model for quick hydration
    await User.findByIdAndUpdate(userId, { profile: profile._id });

    return profile;
  }

  /**
   * @desc    Retrieve a profile by User ID
   */
  async getProfileByUserId(userId) {
    const profile = await Profile.findOne({ user: userId }).populate(
      "user",
      "email role status",
    );

    if (!profile) {
      throw new ApiError(404, "Member profile not found");
    }

    return profile;
  }

  /**
   * @desc    Update profile details
   */
  async updateProfile(userId, updateData) {
    const profile = await Profile.findOneAndUpdate(
      { user: userId },
      { $set: updateData },
      { new: true, runValidators: true },
    );

    if (!profile) {
      throw new ApiError(404, "Cannot update: Profile not found");
    }

    return profile;
  }

  /**
   * @desc    Submit profile for TAM verification
   */
  async submitForApproval(userId) {
    const profile = await Profile.findOne({ user: userId });

    if (!profile) {
      throw new ApiError(404, "Profile not found");
    }

    // Check virtual 'isComplete' logic (handled via manual check here or DTO)
    if (!profile.businessName || !profile.registrationNumber) {
      throw new ApiError(400, "Profile must be complete before submission");
    }

    // Update User status to pending if it wasn't already
    await User.findByIdAndUpdate(userId, { status: "pending" });

    return profile;
  }

  /**
   * @desc    Get all approved members (for the Public Directory)
   */
  async getPublicDirectory(filters = {}) {
    const query = { isApproved: true };

    if (filters.city) query.city = filters.city;
    if (filters.search) {
      query.businessName = { $regex: filters.search, $options: "i" };
    }

    return await Profile.find(query)
      .select("businessName city vehicleTypes fleetSize")
      .sort({ businessName: 1 });
  }
}

export default new MemberService();
