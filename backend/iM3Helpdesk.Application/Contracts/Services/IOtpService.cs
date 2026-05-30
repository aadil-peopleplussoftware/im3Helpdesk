namespace iM3Helpdesk.Application.Contracts.Services;

public interface IOtpService
{
    /// <summary>
    /// 6-digit OTP generate karke email pe bhejo.
    /// Returns false if user not found.
    /// </summary>
    Task<bool> SendOtpAsync(string email);

    /// <summary>
    /// OTP verify karo — true = valid, false = invalid/expired
    /// </summary>
    Task<bool> VerifyOtpAsync(string email, string otp);
}
