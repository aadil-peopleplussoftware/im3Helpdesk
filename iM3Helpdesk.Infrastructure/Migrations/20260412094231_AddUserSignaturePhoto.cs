using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iM3Helpdesk.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserSignaturePhoto : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PhotoUrl",
                table: "Users",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Signature",
                table: "Users",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PhotoUrl",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Signature",
                table: "Users");
        }
    }
}
