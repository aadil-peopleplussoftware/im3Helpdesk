using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iM3Helpdesk.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOrganizationOnboardingEmailFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "SupportEmail",
                table: "Organizations",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "EmailPollingEnabled",
                table: "Organizations",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ImapHost",
                table: "Organizations",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ImapPort",
                table: "Organizations",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpFromEmail",
                table: "Organizations",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpFromName",
                table: "Organizations",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpHost",
                table: "Organizations",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpPassword",
                table: "Organizations",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SmtpPort",
                table: "Organizations",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpUsername",
                table: "Organizations",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EmailPollingEnabled",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "ImapHost",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "ImapPort",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "SmtpFromEmail",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "SmtpFromName",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "SmtpHost",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "SmtpPassword",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "SmtpPort",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "SmtpUsername",
                table: "Organizations");

            migrationBuilder.AlterColumn<string>(
                name: "SupportEmail",
                table: "Organizations",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(256)",
                oldMaxLength: 256,
                oldNullable: true);
        }
    }
}
