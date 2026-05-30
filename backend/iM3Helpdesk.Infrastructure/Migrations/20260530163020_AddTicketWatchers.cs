using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iM3Helpdesk.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTicketWatchers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TicketWatchers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TicketId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TicketWatchers", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TicketWatchers_TicketId",
                table: "TicketWatchers",
                column: "TicketId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketWatchers_TicketId_UserId",
                table: "TicketWatchers",
                columns: new[] { "TicketId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TicketWatchers_UserId",
                table: "TicketWatchers",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TicketWatchers");
        }
    }
}
