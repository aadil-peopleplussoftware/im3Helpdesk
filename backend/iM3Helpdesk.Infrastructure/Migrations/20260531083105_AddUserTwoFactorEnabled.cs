using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iM3Helpdesk.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserTwoFactorEnabled : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsTwoFactorEnabled",
                table: "Users",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsTwoFactorEnabled",
                table: "Users");
        }
    }
}
